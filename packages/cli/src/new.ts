import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { REPO, VhError, writeJson } from "./util.ts";

export function newProject(dirArg: string, opts: { name?: string; language?: string; voiceId?: string; force?: boolean }) {
  const dir = resolve(dirArg);
  if (existsSync(dir) && readdirSync(dir).length && !opts.force) throw new VhError(`${dir} 不是空目录（--force 覆盖模板文件）`);
  mkdirSync(dir, { recursive: true });
  const name = opts.name ?? basename(dir);
  writeJson(join(dir, "vh.json"), {
    name,
    canvas: { w: 1920, h: 1080, fps: 30 },
    design: "illustrated",
    language: opts.language ?? "en",
    voice: { provider: "elevenlabs", voice_id: opts.voiceId ?? "JBFqnCBsd6RMkjVDRZzb", model_id: "eleven_multilingual_v2", pauses: { sentence: 0.3, paragraph: 0.75 } },
  });
  cpSync(join(REPO, "packages", "cli", "templates"), dir, { recursive: true, force: !!opts.force });
  mkdirSync(join(dir, "public"), { recursive: true });
  writeFileSync(join(dir, ".gitignore"), "public/vh/\n.vh/\nrenders/\nreview/stills/\nreview/self-analysis/\n");
  return { project: dir, created: ["vh.json", "brief.md", "script.md", "storyboard.json", "shots/", "public/"], next: `cd ${dir} && vh status` };
}
