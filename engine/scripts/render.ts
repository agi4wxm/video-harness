// 渲染入口（供 MCP server 以子进程调用；结果 JSON 打到 stdout，日志走 stderr）。
//
//   tsx scripts/render.ts --project <dir> --out <file.mp4>            整片
//   tsx scripts/render.ts --project <dir> --stills 0.5,1.2 --out <dir> 指定时刻的单帧 + 拼图
//   可选：--scale 0.5（预览降分辨率）
//
// <dir> 下需要 storyboard.json，可选 voice.json 与 public/（素材，由 asset_use 复制进来）。
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { Storyboard, Voice } from "../src/runtime/types";

const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BROWSER =
  process.env.VH_BROWSER ??
  ["/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell"].find((p) => existsSync(p));

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const log = (m: string) => process.stderr.write(`[render] ${m}\n`);

const project = resolve(arg("project") ?? ".");
const out = resolve(arg("out") ?? join(project, "renders", "video.mp4"));
const stills = arg("stills")?.split(",").map(Number).filter((x) => !Number.isNaN(x));
const scale = Number(arg("scale") ?? 1);

const storyboard = Storyboard.parse(JSON.parse(readFileSync(join(project, "storyboard.json"), "utf8")));
const voicePath = join(project, "voice.json");
const voice = existsSync(voicePath) ? Voice.parse(JSON.parse(readFileSync(voicePath, "utf8"))) : null;
const inputProps = { storyboard, voice };

const t0 = Date.now();
log("bundle");
const publicDir = join(project, "public");
const serveUrl = await bundle({
  entryPoint: join(ENGINE, "src", "index.ts"),
  publicDir: existsSync(publicDir) ? publicDir : undefined,
  webpackOverride: (c) => ({
    ...c,
    resolve: { ...c.resolve, modules: [...(c.resolve?.modules ?? ["node_modules"]), join(ENGINE, "node_modules")] },
  }),
});
const browser = await openBrowser("chrome", { browserExecutable: BROWSER ?? null });
const composition = await selectComposition({ serveUrl, id: "Main", inputProps, puppeteerInstance: browser, browserExecutable: BROWSER ?? null });
log(`composition ${composition.width}x${composition.height} ${composition.durationInFrames}f`);

if (stills?.length) {
  mkdirSync(out, { recursive: true });
  const files: string[] = [];
  for (const t of stills) {
    const frame = Math.min(composition.durationInFrames - 1, Math.max(0, Math.round(t * composition.fps)));
    const f = join(out, `still-${String(frame).padStart(5, "0")}.png`);
    await renderStill({ serveUrl, composition, inputProps, frame, output: f, scale, puppeteerInstance: browser, browserExecutable: BROWSER ?? null });
    files.push(f);
  }
  // 横向拼图，供客户端模型一次看完
  const sheet = join(out, "sheet.png");
  if (files.length > 1) {
    execFileSync("ffmpeg", ["-v", "error", "-y", ...files.flatMap((f) => ["-i", f]), "-filter_complex", `hstack=inputs=${files.length}`, sheet]);
  } else {
    execFileSync("cp", [files[0], sheet]);
  }
  await browser.close({ silent: true });
  console.log(JSON.stringify({ stills: files, sheet, elapsed_s: Math.round((Date.now() - t0) / 1000) }));
} else {
  mkdirSync(dirname(out), { recursive: true });
  let last = -1;
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    codec: "h264",
    outputLocation: out,
    scale,
    puppeteerInstance: browser,
    browserExecutable: BROWSER ?? null,
    onProgress: ({ progress }) => {
      const p = Math.floor(progress * 10);
      if (p !== last) { last = p; log(`progress ${p * 10}%`); }
    },
  });
  await browser.close({ silent: true });
  console.log(JSON.stringify({ video: out, frames: composition.durationInFrames, fps: composition.fps, elapsed_s: Math.round((Date.now() - t0) / 1000) }));
}
