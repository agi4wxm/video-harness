// html 镜头预渲染：按 seek(t) 约定逐帧截图，管道送进 ffmpeg 得到 public/vh/shots/<id>.mp4；
// 若页面实现了 inspect(t)，同时导出场景图到 .vh/inspect/<id>.json，供版面校验使用。
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import type { ShotT, StoryboardT } from "@video-harness/core";
import { findBrowser } from "@video-harness/runtime/node";
import type { Project } from "./project.ts";
import { VhError, log, readJson, sha, writeJson } from "./util.ts";

function dirHash(dir: string): string {
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else files.push(p); } };
  walk(dir);
  return sha(files.sort().map((f) => relative(dir, f) + ":" + sha(readFileSync(f))).join("\n"));
}

export function htmlShots(sb: StoryboardT): ShotT[] {
  return sb.shots.filter((s) => s.scene.kind === "html");
}

export function buildState(pr: Project, sb: StoryboardT): Record<string, { fresh: boolean; video: string }> {
  const state = existsSync(join(pr.paths.state, "build.json")) ? readJson<Record<string, string>>(join(pr.paths.state, "build.json")) : {};
  const out: Record<string, { fresh: boolean; video: string }> = {};
  for (const s of htmlShots(sb)) {
    const entry = resolve(pr.dir, (s.scene as { entry: string }).entry);
    const key = existsSync(entry) ? sha(dirHash(dirname(entry)) + JSON.stringify([s.start, s.end, pr.file.canvas])) : "missing";
    const video = `vh/shots/${s.id}.mp4`;
    out[s.id] = { fresh: state[s.id] === key && existsSync(join(pr.paths.public, video)), video };
  }
  return out;
}

export async function build(pr: Project, sb: StoryboardT, force = false): Promise<Record<string, unknown>> {
  const shots = htmlShots(sb);
  if (!shots.length) return { html_shots: 0, note: "没有 html 镜头，kit / local / react 镜头无需预渲染" };
  const req = createRequire(import.meta.url);
  const { chromium } = req("playwright-core") as typeof import("playwright-core");
  const exe = findBrowser();
  const browser = await chromium.launch({ executablePath: exe ?? undefined, args: ["--no-sandbox"] });
  const statePath = join(pr.paths.state, "build.json");
  const state: Record<string, string> = existsSync(statePath) ? readJson(statePath) : {};
  const { w: W, h: H, fps } = pr.file.canvas;
  const done: string[] = [];
  try {
    for (const s of shots) {
      const entry = resolve(pr.dir, (s.scene as { entry: string }).entry);
      if (!existsSync(entry)) throw new VhError(`${s.id}: ${relative(pr.dir, entry)} 不存在`);
      const key = sha(dirHash(dirname(entry)) + JSON.stringify([s.start, s.end, pr.file.canvas]));
      const video = join(pr.paths.public, "vh", "shots", `${s.id}.mp4`);
      if (!force && state[s.id] === key && existsSync(video)) continue;
      const dur = s.end - s.start;
      const n = Math.max(1, Math.round(dur * fps));
      log(`html ${s.id}: ${n} frames`);
      const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
      await page.goto(pathToFileURL(entry).href + `?w=${W}&h=${H}&fps=${fps}&duration=${dur}`);
      await page.waitForFunction(() => { const v = (window as any).__vh; return v && (v.isReady ? v.isReady() : true); }, null, { timeout: 30000 })
        .catch(() => { throw new VhError(`${s.id}: 页面 30s 内没有就绪（需要 window.__vh = { isReady, seek }）`); });
      mkdirSync(dirname(video), { recursive: true });
      const ff = spawn("ffmpeg", ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(fps), "-i", "-", "-c:v", "libx264", "-crf", "12", "-pix_fmt", "yuv420p", video], { stdio: ["pipe", "inherit", "inherit"] });
      const closed = new Promise<void>((ok, bad) => ff.on("close", (c) => (c === 0 ? ok() : bad(new VhError(`ffmpeg 退出码 ${c}`)))));
      const insp: Array<{ t: number; els: unknown[] }> = [];
      const hasInspect = await page.evaluate(() => typeof (window as any).__vh.inspect === "function");
      for (let f = 0; f < n; f++) {
        const t = f / fps;
        await page.evaluate(async (tt) => { await (window as any).__vh.seek(tt); }, t);
        const buf = await page.screenshot({ type: "png" });
        if (!ff.stdin.write(buf)) await new Promise((ok) => ff.stdin.once("drain", ok));
        if (hasInspect && f % 3 === 0) insp.push({ t, els: await page.evaluate((tt) => (window as any).__vh.inspect(tt), t) });
      }
      ff.stdin.end();
      await closed;
      await page.close();
      if (hasInspect) writeJson(join(pr.paths.state, "inspect", `${s.id}.json`), { shot: s.id, samples: insp });
      state[s.id] = key;
      writeJson(statePath, state);
      done.push(s.id);
    }
  } finally {
    await browser.close();
  }
  return { html_shots: shots.length, rendered: done, skipped_fresh: shots.length - done.length };
}
