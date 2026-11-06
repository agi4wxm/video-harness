#!/usr/bin/env node
// video-harness MCP server —— 第一阶段：参考视频分析（docs/01）。
// server 不调用任何大模型；需要"看"的判断（L5 标注）由客户端模型完成后通过 segments_label 写回。
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { getJob, runCommand, runPython, summarize, waitJob } from "./jobs.js";
import { Library, storyboardRefs } from "./library.js";
import { ShotLabel, VOCAB } from "./vocab.js";

const ROOT = resolve(process.env.VH_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..", ".."));
const PYTHON = process.env.VH_PYTHON ?? "python3";
const MEASURE_DIR = join(ROOT, "measure");
const SET_NAME = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/).describe("参考集名称，如 chaping");

const ENGINE_DIR = join(ROOT, "engine");
const TSX = join(ENGINE_DIR, "node_modules", ".bin", "tsx");
const lib = new Library(ROOT);
const PROJECT_NAME = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/).describe("项目名，对应 projects/<name>/");
const projectDir = (name: string) => join(ROOT, "projects", name);
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


// ---------------------------------------------------------------- 素材库（docs/03）

function image(file: string) {
  return { type: "image" as const, data: readFileSync(file).toString("base64"), mimeType: "image/png" };
}

async function engineRun(kind: string, script: string, args: string[], timeoutS: number) {
  const job = runCommand(kind, TSX, [join("scripts", script), ...args], ENGINE_DIR);
  const done = await waitJob(job.id, timeoutS * 1000);
  return done ?? job;
}

server.registerTool(
  "asset_search",
  {
    title: "检索素材",
    description:
      "按关键词 / 类型 / 标签检索素材库（积木、版式、预设、转场、媒体、配方……）。默认只返回 verified 及以上；草稿素材需 min_status=draft。" +
      "标签与 L5 词表一致，如 tags={shot_type:'diagram'}、{metaphor:'flow-path'}。",
    inputSchema: {
      q: z.string().optional().describe("关键词，空格分隔"),
      kind: z.string().optional().describe("如 block、media、media.image、preset、transition"),
      tags: z.record(z.string(), z.string()).optional(),
      min_status: z.enum(["draft", "verified", "golden"]).default("verified"),
      limit: z.number().int().min(1).max(50).default(20),
    },
  },
  async (args) => text(lib.search(args)),
);

server.registerTool(
  "asset_get",
  {
    title: "查看素材",
    description: "返回素材清单、参数 JSON Schema、示例参数、约束与来源。代码类素材用 asset_preview 看效果。",
    inputSchema: { id: z.string().describe("素材引用，如 block/mg-diagram 或 block/mg-diagram@0.1") },
  },
  async ({ id }) => {
    try {
      const a = lib.resolve(id);
      const content: any[] = [{ type: "text", text: JSON.stringify(a, null, 2) }];
      if (a.kind === "media.image" && a.entry) {
        const f = join(ROOT, a.path, a.entry);
        content.push({ type: "image", data: readFileSync(f).toString("base64"), mimeType: a.entry.endsWith(".webp") ? "image/webp" : "image/png" });
      }
      return { content };
    } catch (e) {
      return fail(String(e));
    }
  },
);

server.registerTool(
  "asset_preview",
  {
    title: "预览积木",
    description: "用示例参数或自定义参数把一个积木渲染成 4 帧拼图（起 / 中 / 后 / 末），先看效果再决定是否使用。耗时约 30s。",
    inputSchema: {
      id: z.string(),
      example: z.string().optional().describe("asset_get 中 examples 的 name；省略时用第一个示例"),
      params: z.record(z.string(), z.any()).optional().describe("自定义参数，优先于示例"),
      duration_s: z.number().min(0.5).max(10).optional(),
    },
  },
  async ({ id, example, params, duration_s }) => {
    let a;
    try {
      a = lib.resolve(id);
    } catch (e) {
      return fail(String(e));
    }
    if (a.kind !== "block") return fail(`目前只能预览积木（block），${a.id} 是 ${a.kind}`);
    const ex = (a.examples ?? []).find((e) => !example || e.name === example);
    const p = params ?? ex?.params;
    if (!p) return fail("没有可用参数：请提供 params 或在清单中添加 examples");
    const dur = duration_s ?? ex?.duration_s ?? 3;
    const key = createHash("sha1").update(JSON.stringify([a.id, p, dur])).digest("hex").slice(0, 12);
    const dir = join(ROOT, "cache", "previews", key);
    const sheet = join(dir, "stills", "sheet.png");
    if (!existsSync(sheet)) {
      mkdirSync(dir, { recursive: true });
      const sb = {
        version: 1,
        canvas: { w: 1080, h: 1920, fps: 30 },
        template: { topic: `预览 · ${a.title}`, tag: a.id },
        shots: [{ id: "p1", start: 0, end: dur, block: a.id, params: p, intent: { focal: "preview" } }],
      };
      writeFileSync(join(dir, "storyboard.json"), JSON.stringify(sb, null, 2));
      lib.use(dir, storyboardRefs(sb), true);
      const at = [0.12, 0.4, 0.7, 0.97].map((k) => +(k * dur).toFixed(2));
      const job = await engineRun("asset_preview", "render.ts", ["--project", dir, "--stills", at.join(","), "--scale", "0.4", "--out", join(dir, "stills")], 300);
      if (job.state !== "done") return text(summarize(job));
    }
    return { content: [{ type: "text" as const, text: `${a.id} · ${dur}s · 帧：起 / 中 / 后 / 末` }, image(sheet)] };
  },
);

server.registerTool(
  "asset_use",
  {
    title: "引入素材",
    description:
      "把素材（及其依赖）引入项目：锁定版本写入 asset-lock.json，媒体文件复制到 public/assets/<kind>/<name>/。" +
      "from_storyboard=true 时自动收集分镜中引用的全部素材。返回媒体素材在分镜中应使用的 src。",
    inputSchema: {
      project: PROJECT_NAME,
      ids: z.array(z.string()).default([]),
      from_storyboard: z.boolean().default(false),
      allow_draft: z.boolean().default(true).describe("draft 素材会在返回中列出，需人工确认（规范 H13）"),
    },
  },
  async ({ project, ids, from_storyboard, allow_draft }) => {
    const dir = projectDir(project);
    try {
      const refs = [...ids];
      if (from_storyboard) refs.push(...storyboardRefs(JSON.parse(readFileSync(join(dir, "storyboard.json"), "utf8"))));
      if (!refs.length) return fail("没有要引入的素材");
      return text(lib.use(dir, refs, allow_draft));
    } catch (e) {
      return fail(String(e));
    }
  },
);

// ---------------------------------------------------------------- 项目与渲染

server.registerTool(
  "project_init",
  {
    title: "创建项目",
    description: "在 projects/<name>/ 创建项目；可从 examples/<example>/ 复制分镜与语音作为起点。",
    inputSchema: { name: PROJECT_NAME, from_example: z.string().optional() },
  },
  async ({ name, from_example }) => {
    const dir = projectDir(name);
    if (existsSync(join(dir, "storyboard.json"))) return fail(`项目已存在：${name}`);
    mkdirSync(dir, { recursive: true });
    if (from_example) {
      const src = join(ROOT, "examples", from_example);
      if (!existsSync(src)) return fail(`示例不存在：${from_example}`);
      for (const f of ["storyboard.json", "voice.json"]) if (existsSync(join(src, f))) cpSync(join(src, f), join(dir, f));
    }
    return text({ project: name, dir, files: readdirSync(dir) });
  },
);

server.registerTool(
  "storyboard_validate",
  {
    title: "校验分镜",
    description: "检查格式、时间覆盖（H11）、素材存在与级别（H13）、积木参数 schema、意图字段与段时长（M1）。",
    inputSchema: { project: PROJECT_NAME },
  },
  async ({ project }) => {
    const job = await engineRun("storyboard_validate", "validate.ts", ["--project", projectDir(project)], 120);
    return text(job.state === "done" ? job.result : summarize(job));
  },
);

server.registerTool(
  "render_stills",
  {
    title: "渲染单帧",
    description: "渲染指定时刻的单帧并横向拼图返回（预览分辨率 0.5）。用于评审节拍点、切点前后。",
    inputSchema: { project: PROJECT_NAME, at: z.array(z.number().min(0)).min(1).max(10).describe("秒") },
  },
  async ({ project, at }) => {
    const dir = projectDir(project);
    try {
      lib.use(dir, storyboardRefs(JSON.parse(readFileSync(join(dir, "storyboard.json"), "utf8"))), true);
    } catch (e) {
      return fail(String(e));
    }
    const out = join(dir, "renders", `stills-${Date.now()}`);
    const job = await engineRun("render_stills", "render.ts", ["--project", dir, "--stills", at.join(","), "--scale", "0.5", "--out", out], 300);
    if (job.state !== "done") return text(summarize(job));
    return { content: [{ type: "text" as const, text: `帧：${at.join("s / ")}s` }, image(join(out, "sheet.png"))] };
  },
);

server.registerTool(
  "render_video",
  {
    title: "渲染视频",
    description: "先校验分镜（有错误则拒绝），再自动锁定素材并渲染整片到 projects/<name>/renders/。立即返回 job_id，用 job_wait 等待。",
    inputSchema: { project: PROJECT_NAME, scale: z.number().min(0.25).max(1).default(1), name: z.string().regex(/^[a-z0-9_-]+$/).default("video") },
  },
  async ({ project, scale, name }) => {
    const dir = projectDir(project);
    const v = await engineRun("storyboard_validate", "validate.ts", ["--project", dir], 120);
    const r = v.result as { ok?: boolean; errors?: string[] } | undefined;
    if (v.state !== "done" || !r?.ok) return fail(`分镜校验未通过：\n${(r?.errors ?? [String(v.error)]).join("\n")}`);
    try {
      lib.use(dir, storyboardRefs(JSON.parse(readFileSync(join(dir, "storyboard.json"), "utf8"))), true);
    } catch (e) {
      return fail(String(e));
    }
    const job = runCommand("render_video", TSX, [join("scripts", "render.ts"), "--project", dir, "--scale", String(scale), "--out", join(dir, "renders", `${name}.mp4`)], ENGINE_DIR);
    return text({ ...summarize(job), next: "job_wait" });
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
