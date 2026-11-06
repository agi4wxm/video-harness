// 长任务：分析、渲染等立即返回 job_id，客户端用 job_status / job_wait 查询（docs/00 §6）。
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

export type JobState = "running" | "done" | "failed";

export interface Job {
  id: string;
  kind: string;
  state: JobState;
  startedAt: number;
  endedAt?: number;
  log: string[];
  result?: unknown;
  error?: string;
}

const jobs = new Map<string, Job>();
const waiters = new Map<string, Array<() => void>>();

export function runPython(kind: string, args: string[], cwd: string, python: string): Job {
  return runCommand(kind, python, ["-m", "measure", ...args], cwd);
}

export function runCommand(kind: string, cmd: string, args: string[], cwd: string): Job {
  const job: Job = { id: randomUUID().slice(0, 8), kind, state: "running", startedAt: Date.now(), log: [] };
  jobs.set(job.id, job);
  const child = spawn(cmd, args, { cwd, env: process.env });
  let stdout = "";
  child.stdout.on("data", (d) => (stdout += d.toString()));
  child.stderr.on("data", (d) => {
    for (const line of d.toString().split("\n")) {
      if (line.trim()) job.log.push(line.trim());
    }
    if (job.log.length > 200) job.log.splice(0, job.log.length - 200);
  });
  child.on("close", (code) => {
    job.endedAt = Date.now();
    if (code === 0) {
      job.state = "done";
      try {
        job.result = JSON.parse(stdout);
      } catch {
        job.result = stdout.trim();
      }
    } else {
      job.state = "failed";
      job.error = `exit ${code}: ${job.log.slice(-10).join("\n")}`;
    }
    for (const w of waiters.get(job.id) ?? []) w();
    waiters.delete(job.id);
  });
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function waitJob(id: string, timeoutMs: number): Promise<Job | undefined> {
  const job = jobs.get(id);
  if (!job || job.state !== "running") return Promise.resolve(job);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(jobs.get(id)), timeoutMs);
    const list = waiters.get(id) ?? [];
    list.push(() => {
      clearTimeout(timer);
      resolve(jobs.get(id));
    });
    waiters.set(id, list);
  });
}

export function summarize(job: Job) {
  return {
    job_id: job.id,
    kind: job.kind,
    state: job.state,
    elapsed_s: Math.round(((job.endedAt ?? Date.now()) - job.startedAt) / 1000),
    progress: job.log.slice(-3),
    ...(job.state === "done" ? { result: job.result } : {}),
    ...(job.state === "failed" ? { error: job.error } : {}),
  };
}
