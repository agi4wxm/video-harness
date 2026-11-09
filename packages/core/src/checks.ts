// 校验：分镜静态校验（H11 时间覆盖、节拍、积木参数、颜色 token、章节、母题）
// 与基于 inspect 的版面校验（H4 安全区、H5 文字重叠、H6 字号与对比度、H7 在屏时长、H8 僵帧）。
// 版面校验直接读场景图，不需要渲染、不需要 OCR。
import { contrast, isHex } from "./color.ts";
import { designFor, kitParams, screenBox, shotFrame, type EvalEnv } from "./evaluate.ts";
import { KITS } from "./kits/index.ts";
import type { StoryboardT, VoiceT } from "./project.ts";
import type { El, Paint, ScreenBox, TextEl } from "./types.ts";

export type Level = "error" | "warn" | "info";
export interface Issue { rule: string; level: Level; shot?: string; t?: number; msg: string }

const r3 = (x: number) => Math.round(x * 1000) / 1000;

export function validateStoryboard(env: EvalEnv, voice: VoiceT | null): Issue[] {
  const out: Issue[] = [];
  const sb = env.storyboard;
  const frame = 1 / env.fps;
  const shots = [...sb.shots].sort((a, b) => a.start - b.start);
  if (shots[0].start > frame) out.push({ rule: "H11", level: "error", msg: `第一个镜头从 ${shots[0].start}s 开始，开头有空白` });
  const ids = new Set<string>();
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    if (ids.has(s.id)) out.push({ rule: "H11", level: "error", shot: s.id, msg: "镜头 id 重复" });
    ids.add(s.id);
    if (s.end <= s.start) out.push({ rule: "H11", level: "error", shot: s.id, msg: "end 必须大于 start" });
    const nx = shots[i + 1];
    if (nx && Math.abs(nx.start - s.end) > frame + 1e-6) out.push({ rule: "H11", level: "error", shot: s.id, msg: `与 ${nx.id} 之间${nx.start > s.end ? "有空隙" : "有重叠"}（${r3(s.end)} → ${r3(nx.start)}）` });
    if (s.transition.kind !== "cut" && s.transition.duration > (s.end - s.start) / 2) out.push({ rule: "H11", level: "error", shot: s.id, msg: "转场时长超过镜头一半" });
    if (i === 0 && s.transition.kind !== "cut") out.push({ rule: "H11", level: "warn", shot: s.id, msg: "第一个镜头的转场会被忽略" });
    for (const b of s.beats) {
      if (b.t < s.start - 1e-6 || b.t >= s.end) out.push({ rule: "SB-beat", level: "error", shot: s.id, t: b.t, msg: `节拍 ${b.t}s 不在镜头区间 [${s.start}, ${s.end})` });
      if (b.motif && !sb.motifs.some((m) => m.id === b.motif)) out.push({ rule: "SB-motif", level: "error", shot: s.id, t: b.t, msg: `未声明的母题 ${b.motif}` });
    }
    if (s.chapter && !env.pack.chapters[s.chapter]) out.push({ rule: "SB-chapter", level: "error", shot: s.id, msg: `设计包没有章节色板 ${s.chapter}` });
    if (s.scene.kind === "kit") {
      const k = KITS[s.scene.kit];
      if (!k) { out.push({ rule: "SB-kit", level: "error", shot: s.id, msg: `未知积木 ${s.scene.kit}` }); continue; }
      const dur = s.end - s.start;
      if (dur < k.duration[0] - 1e-6 || dur > k.duration[1] + 1e-6) out.push({ rule: "SB-kit", level: "warn", shot: s.id, msg: `${k.id} 推荐时长 ${k.duration[0]}–${k.duration[1]}s，当前 ${r3(dur)}s` });
      // H3：参数里不许写 hex
      const hexes = JSON.stringify(s.scene.params).match(/#[0-9a-fA-F]{3,6}\b/g);
      if (hexes) out.push({ rule: "H3", level: "error", shot: s.id, msg: `参数里写死了颜色 ${hexes.join(", ")}：改用调色板角色或在 semantic 里定义语义色` });
      try {
        const p = kitParams(s);
        for (const tt of [0, (s.end - s.start) / 2, s.end - s.start - frame]) shotFrame(env, s, tt, p);
      } catch (e) {
        out.push({ rule: "SB-kit", level: "error", shot: s.id, msg: (e as Error).message });
      }
    }
  }
  for (const [k, v] of Object.entries(sb.semantic)) {
    if (!isHex(v) && !(v in env.pack.palette)) out.push({ rule: "SB-semantic", level: "error", msg: `语义色 ${k}=${v} 既不是 hex 也不是调色板角色` });
  }
  const end = shots[shots.length - 1].end;
  if (voice) {
    if (end + frame < voice.duration) out.push({ rule: "H11", level: "error", msg: `镜头在 ${r3(end)}s 结束，配音到 ${r3(voice.duration)}s，没有覆盖完` });
    if (end > voice.duration + 2) out.push({ rule: "H11", level: "warn", msg: `镜头比配音长 ${r3(end - voice.duration)}s` });
    // M4：每个语句边界附近都要有画面变化（节拍或切镜）
    const marks = shots.flatMap((s) => [s.start, ...s.beats.map((b) => b.t)]);
    const miss = voice.segments.filter((g) => !marks.some((m) => Math.abs(m - g.s) <= 0.8));
    if (miss.length) out.push({ rule: "M4", level: "warn", msg: `${miss.length}/${voice.segments.length} 句开头 0.8s 内没有节拍或切镜：${miss.slice(0, 3).map((g) => `${r3(g.s)}s "${g.text.slice(0, 24)}"`).join("；")}` });
  }
  return out;
}

export interface InspectSample { t: number; shot: string; els: Array<El & { screen: ScreenBox }>; bg: Paint }

/** 按固定间隔求值，得到每个时刻屏幕上的元素（html / react 镜头跳过）。 */
export function inspect(env: EvalEnv, step = 0.1, extra?: (t: number) => El[]): InspectSample[] {
  const out: InspectSample[] = [];
  const sb = env.storyboard;
  const end = Math.max(...sb.shots.map((s) => s.end));
  for (let t = 0; t < end - 1e-6; t += step) {
    const shot = sb.shots.find((s) => t >= s.start && t < s.end);
    if (!shot) continue;
    const f = shotFrame(env, shot, t - shot.start);
    if (!f) continue;
    const els = [...f.els, ...(extra?.(t) ?? [])].map((el) => ({ ...el, screen: screenBox(el, el.layer === "screen" ? undefined : f.camera, env.W, env.H) }));
    out.push({ t: r3(t), shot: shot.id, els, bg: f.bg });
  }
  return out;
}

const firstColor = (p: Paint): string => (typeof p === "string" ? p : "linear" in p ? p.linear[0] : p.radial[0]);
const isText = (e: El): e is TextEl => e.type === "text";
const visible = (e: El) => (e.opacity ?? 1) >= 0.5;

function overlap(a: ScreenBox, b: ScreenBox): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min(a.w * a.h, b.w * b.h);
}

function readingSeconds(text: string): number {
  const cjk = (text.match(/[⺀-鿿]/g) ?? []).length;
  const words = text.replace(/[⺀-鿿]/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(0.8, cjk / 7 + words / 3.3);
}

export function layoutChecks(env: EvalEnv, samples: InspectSample[]): Issue[] {
  const out: Issue[] = [];
  const seen = new Set<string>();
  const once = (key: string, i: Issue) => { if (!seen.has(key)) { seen.add(key); out.push(i); } };
  const { W, H } = env;
  const hold = new Map<string, { shot: string; text: string; first: number; last: number }>();
  const step = samples.length > 1 ? samples[1].t - samples[0].t : 0.1;
  let staticSince: number | null = null, prevSig = "";
  for (const s of samples) {
    const d = designFor(env, env.storyboard.shots.find((x) => x.id === s.shot)?.chapter);
    const texts = s.els.filter((e) => isText(e) && visible(e)) as Array<TextEl & { screen: ScreenBox }>;
    for (const e of texts) {
      const b = e.screen;
      const tol = 2;
      if (e.role !== "decor" && (b.x < d.safe.x0 - tol || b.y < d.safe.y0 - tol || b.x + b.w > d.safe.x1 + tol || b.y + b.h > d.safe.y1 + tol)) {
        once(`H4:${s.shot}:${e.id}`, { rule: "H4", level: "error", shot: s.shot, t: s.t, msg: `文字「${e.text}」超出安全区（框 ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.w)}×${Math.round(b.h)}）` });
      }
      // 字高按静止状态计算（去掉入场缩放，保留相机缩放）
      const px = (e.size * (b.h / e.h)) / (e.scale ?? 1);
      if (px < 0.025 * H - 0.5) once(`H6s:${s.shot}:${e.id}`, { rule: "H6", level: "error", shot: s.shot, t: s.t, msg: `文字「${e.text}」字高 ${Math.round(px)}px < 画面高 2.5%（${Math.round(0.025 * H)}px）` });
      const on = e.on ?? firstColor(s.bg);
      if (isHex(on) && isHex(e.color)) {
        const need = px >= 0.05 * H ? 3 : 4.5;
        const c = contrast(e.color, on);
        if (c < need) once(`H6c:${s.shot}:${e.id}`, { rule: "H6", level: "error", shot: s.shot, t: s.t, msg: `文字「${e.text}」对比度 ${c.toFixed(2)} < ${need}` });
      }
      const k = `${s.shot}:${e.id}`;
      const h = hold.get(k);
      if (h && s.t - h.last <= step * 1.5 + 1e-6) h.last = s.t; else hold.set(k, { shot: s.shot, text: e.text, first: s.t, last: s.t });
    }
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
      const o = overlap(texts[i].screen, texts[j].screen);
      if (o > 0.1) once(`H5:${s.shot}:${texts[i].id}:${texts[j].id}`, { rule: "H5", level: "error", shot: s.shot, t: s.t, msg: `文字「${texts[i].text}」与「${texts[j].text}」重叠 ${(o * 100).toFixed(0)}%` });
    }
    // H8：场景图签名不变即视为僵帧
    const sig = s.els.filter(visible).map((e) => `${e.id}:${Math.round(e.screen.x)}:${Math.round(e.screen.y)}:${Math.round(e.screen.w)}:${((e.opacity ?? 1) * 20) | 0}`).join("|");
    if (sig === prevSig) { if (staticSince === null) staticSince = s.t - step; }
    else {
      if (staticSince !== null && s.t - staticSince > 4) out.push({ rule: "H8", level: "error", shot: s.shot, t: staticSince, msg: `画面静止 ${(s.t - staticSince).toFixed(1)}s > 4s` });
      staticSince = null;
    }
    prevSig = sig;
  }
  const shotEnd = new Map(env.storyboard.shots.map((x) => [x.id, x.end]));
  for (const h of hold.values()) {
    const dur = Math.min(h.last + step, shotEnd.get(h.shot) ?? h.last) - h.first;
    const need = readingSeconds(h.text);
    if (dur + 1e-6 < need) out.push({ rule: "H7", level: "warn", shot: h.shot, t: h.first, msg: `文字「${h.text}」在屏 ${dur.toFixed(1)}s，阅读至少需要 ${need.toFixed(1)}s` });
  }
  return out;
}

/** 文字出现事件：每个文字元素首次可见的时刻。用作评测真值与复核时刻。 */
export function textEvents(samples: InspectSample[]): Array<{ t: number; shot: string; id: string; text: string }> {
  const seen = new Set<string>();
  const out: Array<{ t: number; shot: string; id: string; text: string }> = [];
  for (const s of samples) for (const e of s.els) {
    if (!isText(e) || !visible(e)) continue;
    const k = `${s.shot}:${e.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ t: s.t, shot: s.shot, id: e.id, text: e.text });
  }
  return out;
}
