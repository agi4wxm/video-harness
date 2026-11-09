// Node 端渲染：为项目生成 entry（静态导入本地镜头），打包，渲染整片或指定时刻的单帧 + 拼图。
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import type { MainProps } from "../props.ts";

const RUNTIME = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACKAGES = resolve(RUNTIME, "..");

export function findBrowser(): string | null {
  if (process.env.VH_BROWSER) return process.env.VH_BROWSER;
  const root = "/opt/pw-browsers";
  if (existsSync(root)) {
    for (const d of readdirSync(root).filter((x) => x.startsWith("chromium_headless_shell")).sort().reverse()) {
      const p = join(root, d, "chrome-headless-shell-linux64", "chrome-headless-shell");
      if (existsSync(p)) return p;
    }
  }
  return null; // 交给 Remotion 自己下载 / 查找
}

export interface RenderOpts {
  projectDir: string;
  props: MainProps;
  /** shot id → 本地镜头模块绝对路径（kind: local / react） */
  locals: Record<string, string>;
  out: string;
  /** 指定时刻（秒）：只渲染单帧 + 拼图 */
  stills?: number[];
  scale?: number;
  crf?: number;
  log?: (m: string) => void;
}

export interface RenderResult { video?: string; stills?: string[]; sheet?: string; frames?: number; fps?: number; elapsed_s: number }

function writeEntry(projectDir: string, locals: Record<string, string>): string {
  const dir = join(projectDir, ".vh");
  mkdirSync(dir, { recursive: true });
  const ids = Object.keys(locals);
  const lines = [
    "// 由 vh render 生成，勿手改",
    `import { registerRoot } from "remotion";`,
    `import { makeRoot } from ${JSON.stringify(join(RUNTIME, "src", "Root.tsx"))};`,
    ...ids.map((id, i) => `import * as L${i} from ${JSON.stringify(resolve(locals[id]))};`),
    `registerRoot(makeRoot({ ${ids.map((id, i) => `${JSON.stringify(id)}: L${i} as any`).join(", ")} }));`,
  ];
  const entry = join(dir, "entry.tsx");
  writeFileSync(entry, lines.join("\n") + "\n");
  return entry;
}

export function contactSheet(files: string[], out: string, cols = 4, width = 640): string {
  const tmp = mkdtempSync(join(tmpdir(), "vh-sheet-"));
  files.forEach((f, i) => copyFileSync(f, join(tmp, `${String(i).padStart(3, "0")}.png`)));
  const rows = Math.ceil(files.length / cols);
  const c = Math.min(cols, files.length);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", join(tmp, "%03d.png"), "-vf", `scale=${width}:-2,tile=${c}x${rows}:padding=6:color=white`, "-frames:v", "1", out]);
  rmSync(tmp, { recursive: true, force: true });
  return out;
}

export async function renderProject(o: RenderOpts): Promise<RenderResult> {
  const log = o.log ?? ((m: string) => process.stderr.write(`[render] ${m}\n`));
  const t0 = Date.now();
  const entry = writeEntry(o.projectDir, o.locals);
  const publicDir = join(o.projectDir, "public");
  mkdirSync(publicDir, { recursive: true });
  log("bundle");
  const serveUrl = await bundle({
    entryPoint: entry,
    publicDir,
    webpackOverride: (c) => ({
      ...c,
      resolve: {
        ...c.resolve,
        modules: [...(c.resolve?.modules ?? ["node_modules"]), join(RUNTIME, "node_modules"), join(PACKAGES, "core", "node_modules")],
      },
    }),
  });
  const browserExecutable = findBrowser();
  const browser = await openBrowser("chrome", { browserExecutable });
  const inputProps = o.props as unknown as Record<string, unknown>;
  const composition = await selectComposition({ serveUrl, id: "Main", inputProps, puppeteerInstance: browser, browserExecutable });
  log(`composition ${composition.width}x${composition.height} @${composition.fps} · ${composition.durationInFrames} frames`);
  const scale = o.scale ?? 1;
  try {
    if (o.stills?.length) {
      mkdirSync(o.out, { recursive: true });
      const files: string[] = [];
      for (const t of o.stills) {
        const frame = Math.min(composition.durationInFrames - 1, Math.max(0, Math.round(t * composition.fps)));
        const f = join(o.out, `t${t.toFixed(2).replace(".", "_")}.png`);
        await renderStill({ serveUrl, composition, inputProps, frame, output: f, scale, puppeteerInstance: browser, browserExecutable });
        files.push(f);
      }
      const sheet = contactSheet(files, join(o.out, "sheet.png"));
      return { stills: files, sheet, elapsed_s: Math.round((Date.now() - t0) / 1000) };
    }
    mkdirSync(dirname(o.out), { recursive: true });
    let last = -1;
    await renderMedia({
      serveUrl, composition, inputProps, codec: "h264", audioCodec: "aac", crf: o.crf ?? 18, outputLocation: o.out, scale,
      puppeteerInstance: browser, browserExecutable, concurrency: Number(process.env.VH_CONCURRENCY ?? 0) || null,
      onProgress: ({ progress }) => { const p = Math.floor(progress * 10); if (p !== last) { last = p; log(`progress ${p * 10}%`); } },
    });
    return { video: o.out, frames: composition.durationInFrames, fps: composition.fps, elapsed_s: Math.round((Date.now() - t0) / 1000) };
  } finally {
    await browser.close({ silent: true });
  }
}
