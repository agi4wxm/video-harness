// 调用 vh CLI：MCP 层不复制任何业务逻辑，所有行为都以 CLI 为准。
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const VH = join(REPO, "packages", "cli", "bin", "vh.mjs");

export interface VhRun { code: number; json: any; stderr: string }

export function vh(args: string[], cwd?: string): Promise<VhRun> {
  return new Promise((ok) => {
    const p = spawn(process.execPath, [VH, ...args, "--json"], { cwd: cwd ?? process.cwd(), env: process.env });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => {
      let json: any = null;
      try { json = JSON.parse(out); } catch { json = { raw: out.trim() }; }
      ok({ code: code ?? 1, json, stderr: err.split("\n").slice(-20).join("\n") });
    });
  });
}

export function py(args: string[]): Promise<VhRun> {
  return new Promise((ok) => {
    const exe = process.env.VH_PYTHON ?? join(REPO, "analyze", ".venv", "bin", "python");
    const p = spawn(exe, ["-m", "vh_analyze", ...args], { cwd: join(REPO, "analyze") });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => (err += String(e)));
    p.on("close", (code) => { let json: any = null; try { json = JSON.parse(out); } catch { json = { raw: out.trim() }; } ok({ code: code ?? 1, json, stderr: err.split("\n").slice(-20).join("\n") }); });
  });
}

// ---- 长任务：立即返回 job_id，用 job_wait 等待
interface Job { id: string; label: string; started: number; done: boolean; result?: VhRun; promise: Promise<VhRun> }
const jobs = new Map<string, Job>();

export function startJob(label: string, run: () => Promise<VhRun>): Job {
  const id = randomUUID().slice(0, 8);
  const job: Job = { id, label, started: Date.now(), done: false, promise: Promise.resolve(null as unknown as VhRun) };
  job.promise = run().then((r) => { job.done = true; job.result = r; return r; });
  jobs.set(id, job);
  return job;
}

export async function waitJob(id: string, timeoutS: number): Promise<Job | undefined> {
  const j = jobs.get(id);
  if (!j || j.done) return j;
  await Promise.race([j.promise, new Promise((ok) => setTimeout(ok, timeoutS * 1000))]);
  return j;
}
