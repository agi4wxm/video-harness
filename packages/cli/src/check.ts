// vh check：所有闸门的校验入口。结果写 .vh/check.json，并打印机器可读的 VH_CHECK=PASS|FAIL。
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { inspect, layoutChecks, validateStoryboard, type Issue, type StoryboardT } from "@video-harness/core";
import { buildState } from "./build.ts";
import { briefState, evalEnv, readStoryboard, readVoice, type Project } from "./project.ts";
import { scriptHash } from "./voice.ts";
import { ffprobe, loudness, mtime, writeJson } from "./util.ts";

/** H2：确定性。本地 / react / html 镜头源码里禁止的写法。 */
export function determinismScan(pr: Project, sb: StoryboardT): Issue[] {
  const out: Issue[] = [];
  const rules: Array<[RegExp, string, "error" | "warn"]> = [
    [/Math\.random\s*\(/, "Math.random()：用 ctx.seed / seeded(seed)", "error"],
    [/Date\.now\s*\(|new Date\s*\(|performance\.now\s*\(/, "读取系统时间：画面只能由 t 决定", "error"],
    [/\bfetch\s*\(|XMLHttpRequest|WebSocket/, "运行时网络请求：素材必须放进项目 public/", "error"],
    [/setTimeout\s*\(|setInterval\s*\(/, "计时器：seek(t) 必须同步算出画面", "warn"],
    [/requestAnimationFrame\s*\(/, "requestAnimationFrame 驱动动画会跳帧：只在 seek(t) 里算状态", "warn"],
    [/transition\s*:|animation\s*:|@keyframes/, "CSS 动画 / 过渡不受 seek 控制", "warn"],
  ];
  for (const s of sb.shots) {
    if (s.scene.kind === "kit") continue;
    const p = resolve(pr.dir, s.scene.entry);
    if (!existsSync(p)) { out.push({ rule: "H2", level: "error", shot: s.id, msg: `entry 不存在：${s.scene.entry}` }); continue; }
    const src = readFileSync(p, "utf8").replace(/\/\/.*$/gm, "");
    for (const [re, msg, level] of rules) if (re.test(src)) out.push({ rule: "H2", level, shot: s.id, msg: `${s.scene.entry}：${msg}` });
    if (s.scene.kind !== "html") {
      const hex = src.match(/["'`]#[0-9a-fA-F]{6}["'`]/g);
      if (hex) out.push({ rule: "H3", level: "warn", shot: s.id, msg: `${s.scene.entry} 写死了颜色 ${[...new Set(hex)].slice(0, 4).join(" ")}：用 ctx.d.color(token)` });
    }
  }
  return out;
}

export function renderSpec(pr: Project, file: string, sb: StoryboardT, hasAudio: boolean): Issue[] {
  const out: Issue[] = [];
  const p = ffprobe(file);
  const v = p.streams.find((s: any) => s.codec_type === "video"), a = p.streams.find((s: any) => s.codec_type === "audio");
  const [num, den] = String(v.avg_frame_rate).split("/").map(Number);
  const fps = num / (den || 1);
  const c = pr.file.canvas;
  if (v.width !== c.w || v.height !== c.h) out.push({ rule: "H1", level: "error", msg: `分辨率 ${v.width}×${v.height}，应为 ${c.w}×${c.h}` });
  if (Math.abs(fps - c.fps) > 0.01) out.push({ rule: "H1", level: "error", msg: `帧率 ${fps}，应为 ${c.fps}` });
  if (v.codec_name !== "h264") out.push({ rule: "H1", level: "error", msg: `视频编码 ${v.codec_name}，应为 h264` });
  if (hasAudio && a?.codec_name !== "aac") out.push({ rule: "H1", level: "error", msg: `音频编码 ${a?.codec_name ?? "无"}，应为 aac` });
  const end = Math.max(...sb.shots.map((s) => s.end));
  const dur = Number(p.format.duration);
  if (Math.abs(dur - end) > 1 / c.fps + 0.06) out.push({ rule: "H1", level: "error", msg: `时长 ${dur.toFixed(3)}s，分镜 ${end.toFixed(3)}s` });
  if (hasAudio) {
    const l = loudness(file);
    if (!l) out.push({ rule: "H9", level: "warn", msg: "无法测量响度" });
    else {
      if (Math.abs(l.lufs + 14) > 1) out.push({ rule: "H9", level: "error", msg: `响度 ${l.lufs} LUFS，应为 -14 ± 1` });
      if (l.tp > -1) out.push({ rule: "H9", level: "error", msg: `峰值 ${l.tp} dBFS > -1` });
    }
  }
  return out;
}

export interface CheckReport { stage: string; issues: Issue[]; pass: boolean; summary: Record<string, number> }

export async function check(pr: Project, what: string): Promise<CheckReport> {
  const issues: Issue[] = [];
  const add = (xs: Issue[]) => issues.push(...xs);
  const stages = what === "all" ? ["brief", "voice", "storyboard", "build", "layout", "render"] : [what];
  let sb: StoryboardT | null = null;
  const voice = readVoice(pr);
  for (const st of stages) {
    if (st === "brief") {
      const b = briefState(pr);
      if (b.missing.length) issues.push({ rule: "BRIEF", level: "error", msg: `brief.md 缺少或为空的段落：${b.missing.join(", ")}` });
      if (!b.banned) issues.push({ rule: "BRIEF", level: "error", msg: "brief.md 的 direction 里要有一行「Banned: …」或「禁用：…」（按题材的禁用清单）" });
      if (!b.approved) issues.push({ rule: "GATE", level: "error", msg: "brief.md 未经人工确认（front matter 里 status: approved）" });
    } else if (st === "voice") {
      if (!voice) issues.push({ rule: "VOICE", level: "error", msg: "没有 voice.json（vh voice）" });
      else if (voice.source.script_hash !== scriptHash(pr)) issues.push({ rule: "VOICE", level: "error", msg: "script.md 改过了，voice.json 已过期（vh voice）" });
    } else if (st === "storyboard" || st === "layout" || st === "build" || st === "render") {
      try { sb ??= readStoryboard(pr); } catch (e) { issues.push({ rule: "SB", level: "error", msg: (e as Error).message }); break; }
      const env = await evalEnv(pr, sb);
      if (st === "storyboard") {
        add(validateStoryboard(env, voice));
        if (!sb.approved) issues.push({ rule: "GATE", level: "error", msg: "分镜未经人工确认（storyboard.json 里 approved: true）" });
      } else if (st === "build") {
        add(determinismScan(pr, sb));
        for (const [id, s] of Object.entries(buildState(pr, sb))) if (!s.fresh) issues.push({ rule: "BUILD", level: "error", shot: id, msg: "html 镜头未预渲染或已过期（vh build）" });
        for (const s of sb.shots) if (s.scene.kind === "react") issues.push({ rule: "INSPECT", level: "info", shot: s.id, msg: "react 镜头没有场景图，版面校验跳过；能用 local 场景图就用 local" });
      } else if (st === "layout") {
        const samples = inspect(env, 0.1);
        // html 镜头若导出了 inspect，也纳入版面校验
        for (const s of sb.shots.filter((x) => x.scene.kind === "html")) {
          const f = join(pr.paths.state, "inspect", `${s.id}.json`);
          if (!existsSync(f)) continue;
          const j = JSON.parse(readFileSync(f, "utf8")) as { samples: Array<{ t: number; els: any[] }> };
          for (const x of j.samples) samples.push({ t: s.start + x.t, shot: s.id, bg: "#ffffff", els: x.els.map((e) => ({ ...e, screen: { x: e.x, y: e.y, w: e.w, h: e.h } })) });
        }
        add(layoutChecks(env, samples));
      } else if (st === "render") {
        const f = join(pr.paths.renders, "final.mp4");
        if (!existsSync(f)) issues.push({ rule: "RENDER", level: "error", msg: "没有 renders/final.mp4（vh render --final）" });
        else {
          if (mtime(f) < Math.max(mtime(pr.paths.storyboard), mtime(pr.paths.voice))) issues.push({ rule: "RENDER", level: "error", msg: "final.mp4 比分镜 / 配音旧，需要重新渲染" });
          add(renderSpec(pr, f, sb, !!voice?.audio));
        }
      }
    }
  }
  const summary = { error: 0, warn: 0, info: 0 };
  for (const i of issues) summary[i.level]++;
  const rep = { stage: what, issues, pass: summary.error === 0, summary };
  writeJson(join(pr.paths.state, `check-${what}.json`), rep);
  return rep;
}
