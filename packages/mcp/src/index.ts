#!/usr/bin/env node
// video-harness MCP server：给没有 shell 的客户端用的薄适配器。
// 有 shell 的 agent（Claude Code / Codex / Cursor）直接用 skill + vh 命令即可，不需要它。
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { REPO, py, startJob, vh, waitJob, type VhRun } from "./vh.ts";

const server = new McpServer({ name: "video-harness", version: "0.2.0" });
const P = z.string().describe("项目目录（含 vh.json）的绝对路径");

function reply(r: VhRun, images: string[] = []) {
  const content: any[] = [{ type: "text", text: JSON.stringify(r.json ?? { stderr: r.stderr }, null, 2) }];
  for (const f of images) if (existsSync(f)) content.push({ type: "image", data: readFileSync(f).toString("base64"), mimeType: "image/png" });
  return { content, isError: r.code !== 0 && r.code !== 1 };
}

const simple = (name: string, title: string, description: string, args: (a: any) => string[], input: Record<string, z.ZodTypeAny>) =>
  server.registerTool(name, { title, description, inputSchema: input }, async (a: any) => reply(await vh(args(a))));

simple("vh_new", "新建项目", "创建项目目录：vh.json、brief.md、script.md、storyboard.json、shots/。", (a) => ["new", a.dir, ...(a.language ? ["--language", a.language] : [])], { dir: z.string(), language: z.enum(["en", "zh"]).optional() });
simple("vh_status", "项目状态", "由项目文件推导当前阶段和下一步该做什么。每次开工先调用。", (a) => ["status", "--project", a.project], { project: P });
simple("vh_check", "闸门校验", "brief / voice / storyboard / build / layout / render / all。返回问题列表（rule、shot、t、msg）。", (a) => ["check", a.stage, "--project", a.project], { project: P, stage: z.enum(["brief", "voice", "storyboard", "build", "layout", "render", "all"]).default("all") });
simple("vh_kits", "积木", "不传 id 列出全部积木；传 id 返回参数 JSON Schema 和示例。", (a) => (a.id ? ["kits", "show", a.id] : ["kits"]), { id: z.string().optional() });
simple("vh_voice", "配音", "ElevenLabs 配音。yes=false 只预估字符数（不花钱）；用户确认后 yes=true 合成。", (a) => ["voice", "--project", a.project, ...(a.yes ? ["--yes"] : [])], { project: P, yes: z.boolean().default(false) });
simple("vh_build", "预渲染 html 镜头", "按 seek(t) 逐帧截图 html 镜头。", (a) => ["build", "--project", a.project], { project: P });
simple("vh_review_apply", "合并复核答案", "读取 review/answers.json，生成 scorecard.json。", (a) => ["review", "apply", "--project", a.project], { project: P });

server.registerTool("vh_stills", {
  title: "渲染单帧拼图", description: "渲染指定时刻（秒）的画面，返回拼图图片，供看图检查。",
  inputSchema: { project: P, times: z.array(z.number()).min(1).max(16) },
}, async ({ project, times }) => {
  const r = await vh(["stills", times.join(","), "--project", project]);
  return reply(r, r.json?.sheet ? [r.json.sheet] : []);
});

server.registerTool("vh_review_tasks", {
  title: "生成复核题目", description: "每个节拍渲染一张图并出题，返回总拼图；逐条作答写入 review/answers.json 后调用 vh_review_apply。",
  inputSchema: { project: P },
}, async ({ project }) => {
  const r = await vh(["review", "tasks", "--project", project]);
  return reply(r, r.json?.sheet ? [r.json.sheet] : []);
});

server.registerTool("vh_render", {
  title: "渲染", description: "preview（低清）或 final（成片，先跑全部闸门）。长任务：返回 job_id，用 job_wait 等待。",
  inputSchema: { project: P, mode: z.enum(["preview", "final"]).default("preview") },
}, async ({ project, mode }) => {
  const j = startJob(`render ${mode}`, () => vh(["render", `--${mode}`, "--project", project]));
  return { content: [{ type: "text", text: JSON.stringify({ job_id: j.id, next: "job_wait" }) }] };
});

server.registerTool("analyze_video", {
  title: "分析视频", description: "用 vh_analyze 测量参考视频或成片：版式、切点 / 视觉节拍、旁白停顿对齐、调色板。rea=true 时同时调用 rea-video 拆制作方式。长任务。",
  inputSchema: { path: z.string(), out: z.string(), asr: z.string().default("none").describe("none | openai | local | file:<voice.json>"), lang: z.string().default("en"), rea: z.boolean().default(false) },
}, async ({ path, out, asr, lang, rea }) => {
  const j = startJob("analyze", () => py(["run", resolve(path), "--out", resolve(out), "--asr", asr, "--lang", lang, ...(rea ? ["--rea"] : [])]));
  return { content: [{ type: "text", text: JSON.stringify({ job_id: j.id, next: "job_wait" }) }] };
});

server.registerTool("vh_compare", {
  title: "成片比对", description: "测量成片并与参考分析（analysis.json / profile.json）比对节奏与色彩。诊断信息，不是闸门。长任务。",
  inputSchema: { project: P, ref: z.string() },
}, async ({ project, ref }) => {
  const j = startJob("compare", () => vh(["compare", "--ref", resolve(ref), "--project", project]));
  return { content: [{ type: "text", text: JSON.stringify({ job_id: j.id, next: "job_wait" }) }] };
});

server.registerTool("job_wait", {
  title: "等待长任务", description: "等待 job 完成（最多 timeout_s 秒），返回结果或当前状态。",
  inputSchema: { job_id: z.string(), timeout_s: z.number().min(1).max(600).default(120) },
}, async ({ job_id, timeout_s }) => {
  const j = await waitJob(job_id, timeout_s);
  if (!j) return { content: [{ type: "text", text: `没有这个 job：${job_id}` }], isError: true };
  if (!j.done) return { content: [{ type: "text", text: JSON.stringify({ job_id, label: j.label, running_s: Math.round((Date.now() - j.started) / 1000), done: false }) }] };
  return reply(j.result!);
});

// 工作流与规范：skill 本身作为 prompt / resources 暴露，保证 MCP 与 skill 用户读到的是同一份说明
const SKILL = join(REPO, "skills", "video-harness");
server.registerPrompt("make-video", { title: "用 video-harness 做一条讲解视频", description: "加载 skill 工作流" }, () => ({
  messages: [{ role: "user", content: { type: "text", text: readFileSync(join(SKILL, "SKILL.md"), "utf8") } }],
}));
for (const f of existsSync(join(SKILL, "references")) ? readdirSync(join(SKILL, "references")).filter((x) => x.endsWith(".md")) : []) {
  server.registerResource(`ref-${f.replace(/\.md$/, "")}`, `video-harness://references/${f}`, { title: f, mimeType: "text/markdown" }, async (uri) => ({
    contents: [{ uri: uri.href, text: readFileSync(join(SKILL, "references", f), "utf8") }],
  }));
}

await server.connect(new StdioServerTransport());
