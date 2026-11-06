#!/usr/bin/env node
// video-harness MCP server —— 第一阶段：参考视频分析（docs/01）。
// server 不调用任何大模型；需要"看"的判断（L5 标注）由客户端模型完成后通过 segments_label 写回。
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { getJob, runPython, summarize, waitJob } from "./jobs.js";
import { ShotLabel, VOCAB } from "./vocab.js";

const ROOT = resolve(process.env.VH_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..", ".."));
const PYTHON = process.env.VH_PYTHON ?? "python3";
const MEASURE_DIR = join(ROOT, "measure");
const SET_NAME = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/).describe("参考集名称，如 chaping");

const setDir = (set: string) => join(ROOT, "analysis", set);
const videosDir = (set: string) => join(setDir(set), "videos");

function text(obj: unknown) {
  return { content: [{ type: "text" as const, text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }] };
}

function fail(msg: string) {
  return { content: [{ type: "text" as const, text: msg }], isError: true };
}

const server = new McpServer({ name: "video-harness", version: "0.1.0" });

// ---------------------------------------------------------------- 分析

server.registerTool(
  "video_analyze",
  {
    title: "分析参考视频",
    description:
      "对一个或多个视频跑 L0–L4 测量（规格、响度、切点、语音对齐、文字、色彩、运动、入场动效），并生成 L5 标注用拼图与切点复核拼图。" +
      "耗时约每条 3–4 分钟，立即返回 job_id，用 job_wait 等待。",
    inputSchema: {
      set: SET_NAME,
      paths: z.array(z.string()).min(1).describe("视频文件路径（相对仓库根目录或绝对路径）"),
      asr: z.enum(["auto", "openai", "local", "none"]).default("auto"),
    },
  },
  async ({ set, paths, asr }) => {
    const abs = paths.map((p) => resolve(ROOT, p));
    const missing = abs.filter((p) => !existsSync(p));
    if (missing.length) return fail(`文件不存在：${missing.join(", ")}`);
    const job = runPython("video_analyze", ["analyze", ...abs, "--out", videosDir(set), "--asr", asr], MEASURE_DIR, PYTHON);
    return text({ ...summarize(job), next: "job_wait" });
  },
);

server.registerTool(
  "job_status",
  { title: "查询任务", description: "查询长任务状态与最近进度。", inputSchema: { job_id: z.string() } },
  async ({ job_id }) => {
    const job = getJob(job_id);
    return job ? text(summarize(job)) : fail(`未知 job：${job_id}`);
  },
);

server.registerTool(
  "job_wait",
  {
    title: "等待任务",
    description: "等待长任务结束，最多 timeout_s 秒；超时返回当前进度，可再次调用。",
    inputSchema: { job_id: z.string(), timeout_s: z.number().int().min(1).max(600).default(240) },
  },
  async ({ job_id, timeout_s }) => {
    const job = await waitJob(job_id, timeout_s * 1000);
    return job ? text(summarize(job)) : fail(`未知 job：${job_id}`);
  },
);

server.registerTool(
  "analysis_list",
  { title: "列出分析结果", description: "列出参考集中已分析的视频及其关键指标。", inputSchema: { set: SET_NAME } },
  async ({ set }) => {
    const dir = videosDir(set);
    if (!existsSync(dir)) return fail(`参考集 ${set} 还没有分析结果`);
    const rows = readdirSync(dir)
      .filter((d) => existsSync(join(dir, d, "measures.json")))
      .map((d) => {
        const m = JSON.parse(readFileSync(join(dir, d, "measures.json"), "utf8"));
        const sj = JSON.parse(readFileSync(join(dir, d, "shots.json"), "utf8"));
        const segs = (sj.segments ?? []) as Array<{ label: unknown }>;
        return {
          video_id: d,
          aspect: m.L0.aspect,
          duration_s: m.L0.duration_s,
          n_shots: m.L1.n_shots,
          n_segments: segs.length,
          labeled_segments: segs.filter((s) => s.label).length,
          sheets: readdirSync(join(dir, d, "contact")).filter((f) => f.endsWith(".png")),
        };
      });
    return text(rows);
  },
);

server.registerTool(
  "analysis_sheet",
  {
    title: "查看拼图",
    description:
      "返回分析拼图图片。sheet 取值：overview（全片总览，| 表示硬切）、shots-01/02/…（每段起/中/终三帧 + 文案，用于 L5 标注）、cuts / candidates（切点复核，用于 E1）。",
    inputSchema: { set: SET_NAME, video_id: z.string(), sheet: z.string().regex(/^(overview|shots-\d{2}|cuts|candidates)$/) },
  },
  async ({ set, video_id, sheet }) => {
    const sub = sheet === "cuts" || sheet === "candidates" ? "review" : "contact";
    const file = join(videosDir(set), video_id, sub, `${sheet}.png`);
    if (!existsSync(file)) return fail(`拼图不存在：${file}`);
    return { content: [{ type: "image" as const, data: readFileSync(file).toString("base64"), mimeType: "image/png" }] };
  },
);

server.registerTool(
  "segments_label",
  {
    title: "写回 L5 标注",
    description:
      "看过 shots-xx 拼图后，按封闭词表为段（segment，id 形如 g012；段 = 硬切 ∪ 视觉节拍切分出的片段）打标签并写回 shots.json。" +
      "词表见 resource vh://vocab/l5，不在词表内的值会被拒绝。",
    inputSchema: { set: SET_NAME, video_id: z.string(), labels: z.array(ShotLabel).min(1) },
  },
  async ({ set, video_id, labels }) => {
    const file = join(videosDir(set), video_id, "shots.json");
    if (!existsSync(file)) return fail(`未找到 ${file}`);
    const data = JSON.parse(readFileSync(file, "utf8"));
    const segs = (data.segments ?? []) as Array<{ id: string; label: unknown }>;
    const byId = new Map(segs.map((s) => [s.id, s]));
    const unknown = labels.filter((l) => !byId.has(l.segment_id)).map((l) => l.segment_id);
    if (unknown.length) return fail(`未知段：${unknown.join(", ")}`);
    for (const l of labels) {
      const { segment_id, ...rest } = l;
      byId.get(segment_id)!.label = rest;
    }
    writeFileSync(file, JSON.stringify(data, null, 2));
    const labeled = segs.filter((s) => s.label).length;
    return text({ written: labels.length, labeled, total: segs.length });
  },
);

server.registerTool(
  "profile_build",
  {
    title: "聚合参考 profile",
    description: "把参考集中所有已分析视频聚合为 analysis/<set>/reference-profile.json（按画幅分组，输出分布）。",
    inputSchema: { set: SET_NAME, author: z.string().optional() },
  },
  async ({ set, author }) => {
    const out = join(setDir(set), "reference-profile.json");
    const args = ["profile", videosDir(set), "--out", out, ...(author ? ["--author", author] : [])];
    const job = runPython("profile_build", args, MEASURE_DIR, PYTHON);
    const done = await waitJob(job.id, 120_000);
    if (!done || done.state !== "done") return text(summarize(job));
    return text(JSON.parse(readFileSync(out, "utf8")));
  },
);

// ---------------------------------------------------------------- resources

server.registerResource(
  "vocab-l5",
  "vh://vocab/l5",
  { title: "L5 封闭词表", description: "镜头标注与素材标签共用的词表", mimeType: "application/json" },
  async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(VOCAB, null, 2) }] }),
);

for (const doc of ["00-architecture", "01-reference-analysis", "02-quality-spec", "03-asset-library"]) {
  server.registerResource(
    `doc-${doc}`,
    `vh://docs/${doc}`,
    { title: doc, description: `设计文档 docs/${doc}.md`, mimeType: "text/markdown" },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: readFileSync(join(ROOT, "docs", `${doc}.md`), "utf8") }],
    }),
  );
}

// ---------------------------------------------------------------- prompts

server.registerPrompt(
  "analyze-references",
  {
    title: "分析参考视频",
    description: "完整的参考分析流程：测量 → 复核 → 标注 → 聚合",
    argsSchema: { set: z.string(), paths: z.string().describe("逗号分隔的视频路径") },
  },
  ({ set, paths }) => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: [
            `对参考集 ${set} 做参考分析，视频：${paths}。流程：`,
            "1. video_analyze → job_wait 直到完成；",
            "2. 对每个视频用 analysis_sheet 查看 cuts / candidates，判断检测出的切点和被拒候选各有多少是真切点，记录 E1 结论；",
            "3. 读取 vh://vocab/l5，逐张查看 shots-xx 拼图，用 segments_label 写回每段标签（只能用词表中的值，给出依据时间点）；",
            "4. profile_build 生成 reference-profile.json，并总结风格要点与无法映射的条目。",
          ].join("\n"),
        },
      },
    ],
  }),
);

await server.connect(new StdioServerTransport());
