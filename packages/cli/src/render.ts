import { join } from "node:path";
import type { MainProps } from "@video-harness/runtime";
import { renderProject, type RenderResult } from "@video-harness/runtime/node";
import { buildState } from "./build.ts";
import { check } from "./check.ts";
import { localPaths, readStoryboard, readVoice, type Project } from "./project.ts";
import { VhError } from "./util.ts";

export function mainProps(pr: Project): MainProps {
  const sb = readStoryboard(pr);
  const prerendered: Record<string, string> = {};
  for (const [id, s] of Object.entries(buildState(pr, sb))) if (s.fresh) prerendered[id] = s.video;
  return { canvas: pr.file.canvas, pack: pr.pack, storyboard: sb, voice: readVoice(pr), prerendered };
}

export async function stills(pr: Project, times: number[], outDir: string, scale = 0.5): Promise<RenderResult> {
  const props = mainProps(pr);
  return renderProject({ projectDir: pr.dir, props, locals: localPaths(pr, props.storyboard), out: outDir, stills: times, scale });
}

export async function render(pr: Project, mode: "preview" | "final", force: boolean): Promise<RenderResult & { gate?: unknown }> {
  const sbCheck = await check(pr, "storyboard");
  const blocking = sbCheck.issues.filter((i) => i.level === "error" && (mode === "final" || i.rule !== "GATE"));
  if (blocking.length && !force) throw new VhError(`分镜校验未通过（${blocking.length} 个错误）：\n${blocking.slice(0, 8).map((i) => `  [${i.rule}] ${i.shot ?? ""} ${i.msg}`).join("\n")}`, "vh check storyboard");
  if (mode === "final" && !force) {
    for (const st of ["brief", "voice", "build", "layout"]) {
      const r = await check(pr, st);
      if (!r.pass) throw new VhError(`final 渲染前 ${st} 闸门未通过：\n${r.issues.filter((i) => i.level === "error").slice(0, 8).map((i) => `  [${i.rule}] ${i.shot ?? ""} ${i.msg}`).join("\n")}`, `vh check ${st}`);
    }
  }
  const props = mainProps(pr);
  const out = join(pr.paths.renders, mode === "final" ? "final.mp4" : "preview.mp4");
  return renderProject({ projectDir: pr.dir, props, locals: localPaths(pr, props.storyboard), out, scale: mode === "final" ? 1 : 0.5, crf: mode === "final" ? 18 : 26 });
}
