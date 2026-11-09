// vh 命令分发。每个命令返回一个对象：--json 时原样输出 JSON，否则输出便于阅读的文本。
import { resolve } from "node:path";
import { build } from "./build.ts";
import { check } from "./check.ts";
import { compare } from "./compare.ts";
import { evalSynth } from "./eval.ts";
import { kitPreview, kitShow, kitsList } from "./kits.ts";
import { newProject } from "./new.ts";
import { openProject, readStoryboard } from "./project.ts";
import { render, stills } from "./render.ts";
import { reviewApply, reviewTasks } from "./review.ts";
import { status } from "./status.ts";
import { VhError, arg, flag, positional } from "./util.ts";
import { voice } from "./voice.ts";

const HELP = `vh —— video-harness 命令行（代码生成讲解视频）

项目
  vh new <dir> [--name N] [--language en|zh] [--voice-id ID]   新建项目（vh.json、brief.md、script.md、storyboard.json、shots/）
  vh status                                     由文件推导当前阶段和下一步
  vh check <brief|voice|storyboard|build|layout|render|all>   闸门校验，输出 VH_CHECK=PASS|FAIL

制作
  vh voice [--yes]                              ElevenLabs 配音：默认只预估字符数，--yes 才合成（逐句缓存）
  vh build [--force]                            预渲染 html 镜头（seek(t) 逐帧截图）
  vh stills <t1,t2,...> [--out dir]             渲染指定时刻的单帧 + 拼图（默认 renders/stills/）
  vh render --preview | --final [--force]       低清预览 / 成片（final 前自动跑全部闸门）

复核与比对
  vh review tasks                               每个节拍出一张图 + 题目 → review/tasks.json、answers.json
  vh review apply                               合并答案 → review/scorecard.json（P0 清零才能出成片）
  vh compare --ref <analysis.json> [--video f]  用 analyze/ 测量成片，与参考视频的节奏 / 色彩比对（诊断）

积木
  vh kits                                       列出积木
  vh kits show <id>                             参数 JSON Schema + 示例
  vh kits preview <id> [--out dir] [--chapter night]   示例参数渲染拼图

评测
  vh eval synth [--n 3] [--seed 1] [--out eval/synthetic/out] [--scale 0.5]   合成带真值的评测视频

通用：--project <dir>（默认当前目录向上找 vh.json），--json 输出 JSON`;

function human(cmd: string, r: any): string {
  if (cmd === "status") {
    const lines = r.stages.map((s: any) => `${s.ok ? "✓" : "✗"} ${s.title.padEnd(14)} ${s.detail}`);
    return [`项目 ${r.project}`, ...lines, "", `当前阶段：${r.current}`, `下一步：${r.next}`].join("\n");
  }
  if (cmd === "check") {
    const lines = r.issues.map((i: any) => `${i.level === "error" ? "✗" : i.level === "warn" ? "!" : "·"} [${i.rule}]${i.shot ? " " + i.shot : ""}${i.t !== undefined ? ` @${i.t}s` : ""} ${i.msg}`);
    return [...lines, `${r.summary.error} error · ${r.summary.warn} warn`, `VH_CHECK=${r.pass ? "PASS" : "FAIL"}`].join("\n");
  }
  if (cmd === "kits" && Array.isArray(r)) return r.map((k: any) => `${k.id.padEnd(22)} ${k.title}（${k.duration[0]}–${k.duration[1]}s）\n${" ".repeat(23)}${k.summary}`).join("\n");
  return JSON.stringify(r, null, 2);
}

export async function main(argv: string[]): Promise<number> {
  const [cmd, sub] = positional(argv);
  const json = flag(argv, "json");
  const proj = () => openProject(arg(argv, "project"));
  try {
    let r: unknown;
    switch (cmd) {
      case undefined: case "help": case "--help": console.log(HELP); return 0;
      case "new": if (!sub) throw new VhError("用法：vh new <dir>"); r = newProject(sub, { name: arg(argv, "name"), language: arg(argv, "language"), voiceId: arg(argv, "voice-id"), force: flag(argv, "force") }); break;
      case "status": r = await status(proj()); break;
      case "check": r = await check(proj(), sub ?? "all"); break;
      case "voice": r = await voice(proj(), { yes: flag(argv, "yes") }); break;
      case "build": { const p = proj(); r = await build(p, readStoryboard(p), flag(argv, "force")); break; }
      case "stills": {
        const p = proj();
        if (!sub) throw new VhError("用法：vh stills 1.5,3,7.2");
        r = await stills(p, sub.split(",").map(Number), resolve(arg(argv, "out") ?? `${p.paths.renders}/stills`), Number(arg(argv, "scale") ?? 0.5));
        break;
      }
      case "render": r = await render(proj(), flag(argv, "final") ? "final" : "preview", flag(argv, "force")); break;
      case "review":
        if (sub === "tasks") r = await reviewTasks(proj());
        else if (sub === "apply") r = await reviewApply(proj());
        else throw new VhError("用法：vh review tasks | vh review apply");
        break;
      case "compare": { const ref = arg(argv, "ref"); if (!ref) throw new VhError("用法：vh compare --ref <analysis.json>"); r = compare(proj(), resolve(ref), arg(argv, "video")); break; }
      case "kits":
        if (!sub) r = kitsList();
        else if (sub === "show") r = kitShow(positional(argv)[2] ?? "");
        else if (sub === "preview") { const id = positional(argv)[2] ?? ""; r = await kitPreview(id, resolve(arg(argv, "out") ?? `kit-preview/${id.replace("kit/", "")}`), arg(argv, "chapter")); }
        else throw new VhError("用法：vh kits [show|preview] <id>");
        break;
      case "eval":
        if (sub !== "synth") throw new VhError("用法：vh eval synth");
        r = await evalSynth(resolve(arg(argv, "out") ?? "eval/synthetic/out"), Number(arg(argv, "n") ?? 3), Number(arg(argv, "seed") ?? 1), Number(arg(argv, "scale") ?? 0.5));
        break;
      default: throw new VhError(`未知命令 ${cmd}`, "vh help");
    }
    console.log(json ? JSON.stringify(r, null, 2) : human(cmd!, r));
    if (cmd === "check") return (r as { pass: boolean }).pass ? 0 : 1;
    return 0;
  } catch (e) {
    const err = e as Error & { next?: string };
    if (json) console.log(JSON.stringify({ error: err.message, next: err.next ?? null }));
    else console.error(`✗ ${err.message}${err.next ? `\n→ 下一步：${err.next}` : ""}${e instanceof VhError ? "" : "\n" + err.stack}`);
    return 2;
  }
}
