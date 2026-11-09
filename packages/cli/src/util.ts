import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export class VhError extends Error {
  constructor(msg: string, public next?: string) { super(msg); }
}

export const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
export const readJson = <T = unknown>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;
export function writeJson(p: string, v: unknown) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(v, null, 2) + "\n");
}
export const mtime = (p: string) => (existsSync(p) ? statSync(p).mtimeMs : 0);
export const log = (m: string) => process.stderr.write(`[vh] ${m}\n`);

export function cacheDir(sub: string): string {
  const d = join(process.env.VH_CACHE_DIR ?? join(homedir(), ".cache", "video-harness"), sub);
  mkdirSync(d, { recursive: true });
  return d;
}

export function ffprobe(path: string): any {
  return JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", path], { encoding: "utf8" }));
}

export function audioDuration(path: string): number {
  return Number(ffprobe(path).format.duration);
}

/** ffmpeg ebur128：integrated LUFS 与 true peak（统计在 stderr） */
export function loudness(path: string): { lufs: number; tp: number } | null {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", path, "-filter_complex", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" });
  const s = String(r.stderr ?? "");
  const sum = s.slice(s.lastIndexOf("Summary:"));
  const I = /I:\s+(-?[\d.]+) LUFS/.exec(sum), P = /Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(sum);
  if (!I) return null;
  return { lufs: Number(I[1]), tp: P ? (P[1] === "-inf" ? -99 : Number(P[1])) : NaN };
}

export function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith("--")) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : undefined;
}
export const flag = (argv: string[], name: string) => argv.includes(`--${name}`);
export function positional(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) { if (!argv[i].includes("=") && i + 1 < argv.length && !argv[i + 1].startsWith("--") && !BOOL.has(argv[i].slice(2))) i++; continue; }
    out.push(argv[i]);
  }
  return out;
}
const BOOL = new Set(["json", "yes", "force", "preview", "help", "dry-run"]);

export function pythonBin(): string {
  if (process.env.VH_PYTHON) return process.env.VH_PYTHON;
  const venv = join(REPO, "analyze", ".venv", "bin", "python");
  return existsSync(venv) ? venv : "python3";
}

/**
 * HTTP JSON 请求。用 curl 而不是 Node fetch：curl 遵守 HTTPS_PROXY / 系统证书，
 * 在代理环境（例如云端沙箱注入密钥）和普通机器上行为一致。
 */
export function httpJson(method: "GET" | "POST", url: string, headers: Record<string, string>, body?: unknown): { status: number; json: any; text: string } {
  const args = ["-sS", "-X", method, url, "-w", "\n%{http_code}", "--max-time", "180"];
  for (const [k, v] of Object.entries(headers)) args.push("-H", `${k}: ${v}`);
  if (body !== undefined) args.push("-H", "content-type: application/json", "--data-binary", "@-");
  const out = execFileSync("curl", args, { input: body !== undefined ? JSON.stringify(body) : undefined, maxBuffer: 256 << 20, encoding: "utf8" });
  const i = out.lastIndexOf("\n");
  const text = out.slice(0, i), status = Number(out.slice(i + 1));
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* 非 JSON */ }
  return { status, json, text };
}
