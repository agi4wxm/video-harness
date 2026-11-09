// 读项目目录：vh.json、voice.json、storyboard.json、设计包、本地镜头模块。
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ProjectFile, Storyboard, Voice, loadPack,
  type DesignPackT, type EvalEnv, type LocalScene, type ProjectFileT, type StoryboardT, type VoiceT,
} from "@video-harness/core";
import { VhError, readJson } from "./util.ts";

export interface Project {
  dir: string;
  file: ProjectFileT;
  pack: DesignPackT;
  paths: Record<"vh" | "brief" | "script" | "voice" | "storyboard" | "public" | "renders" | "review" | "state", string>;
}

export function findProjectDir(start: string): string {
  let d = resolve(start);
  for (;;) {
    if (existsSync(join(d, "vh.json"))) return d;
    const up = resolve(d, "..");
    if (up === d) throw new VhError(`在 ${start} 及其上级目录里没找到 vh.json`, "vh new <dir>");
    d = up;
  }
}

export function openProject(dirArg?: string): Project {
  const dir = findProjectDir(dirArg ?? process.cwd());
  const file = ProjectFile.parse(readJson(join(dir, "vh.json")));
  const custom = file.design.endsWith(".json") ? readJson(resolve(dir, file.design)) : undefined;
  const pack = loadPack(file.design, custom);
  const p = (x: string) => join(dir, x);
  return {
    dir, file, pack,
    paths: {
      vh: p("vh.json"), brief: p("brief.md"), script: p("script.md"), voice: p("voice.json"), storyboard: p("storyboard.json"),
      public: p("public"), renders: p("renders"), review: p("review"), state: p(".vh"),
    },
  };
}

export function readVoice(pr: Project): VoiceT | null {
  if (!existsSync(pr.paths.voice)) return null;
  return Voice.parse(readJson(pr.paths.voice));
}

export function readStoryboard(pr: Project): StoryboardT {
  if (!existsSync(pr.paths.storyboard)) throw new VhError("还没有 storyboard.json", "按 skills/video-harness/references/storyboard.md 写分镜");
  const r = Storyboard.safeParse(readJson(pr.paths.storyboard));
  if (!r.success) throw new VhError(`storyboard.json 不合法：\n${r.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`);
  return r.data;
}

/** 本地镜头（kind: local / react）的模块绝对路径 */
export function localPaths(pr: Project, sb: StoryboardT): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of sb.shots) if (s.scene.kind === "local" || s.scene.kind === "react") {
    const p = resolve(pr.dir, s.scene.entry);
    if (!existsSync(p)) throw new VhError(`${s.id} 的 entry 不存在：${s.scene.entry}`);
    out[s.id] = p;
  }
  return out;
}

/** 在 Node 里加载 local 镜头（用于 inspect / 校验）；react 镜头不加载（没有 inspect）。 */
export async function loadLocals(pr: Project, sb: StoryboardT): Promise<Record<string, LocalScene>> {
  const out: Record<string, LocalScene> = {};
  for (const s of sb.shots) if (s.scene.kind === "local") {
    const p = resolve(pr.dir, s.scene.entry);
    const m = await import(pathToFileURL(p).href + `?v=${Date.now()}`);
    if (typeof m.timeline !== "function") throw new VhError(`${s.scene.entry} 必须导出 timeline(params, ctx)`);
    out[s.id] = m as LocalScene;
  }
  return out;
}

export async function evalEnv(pr: Project, sb: StoryboardT): Promise<EvalEnv> {
  return { W: pr.file.canvas.w, H: pr.file.canvas.h, fps: pr.file.canvas.fps, pack: pr.pack, storyboard: sb, locals: await loadLocals(pr, sb) };
}

export function briefState(pr: Project): { ok: boolean; approved: boolean; missing: string[]; banned: boolean } {
  if (!existsSync(pr.paths.brief)) return { ok: false, approved: false, missing: ["brief.md"], banned: false };
  const s = readFileSync(pr.paths.brief, "utf8");
  const fm = /^---\n([\s\S]*?)\n---/.exec(s)?.[1] ?? "";
  const approved = /^status:\s*approved\s*$/m.test(fm);
  const missing: string[] = [];
  for (const sec of ["inputs", "direction", "structure", "build", "gotchas", "start"]) {
    const m = new RegExp(`^##\\s+${sec}\\b[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`, "mi").exec(s);
    const body = (m?.[1] ?? "").replace(/<!--[\s\S]*?-->/g, "").trim();
    if (!body) missing.push(sec);
  }
  const banned = /(banned|禁用)\s*[:：]\s*\S/i.test(s.replace(/<!--[\s\S]*?-->/g, ""));
  return { ok: missing.length === 0 && banned, approved, missing, banned };
}
