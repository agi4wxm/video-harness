// 项目文件 schema：vh.json（项目设置）、voice.json（配音时间轴）、storyboard.json（分镜 v2）。
// 所有阶段之间只通过这些文件交接；状态由文件推导，见 packages/cli/src/status.ts。
import { z } from "zod";

export const Canvas = z.object({ w: z.number().int().positive(), h: z.number().int().positive(), fps: z.number().int().positive() });

export const ProjectFile = z.object({
  name: z.string(),
  canvas: Canvas.default({ w: 1920, h: 1080, fps: 30 }),
  design: z.string().default("illustrated").describe("内置设计包 id，或项目内 json 路径（如 ./design.json）"),
  language: z.string().default("en"),
  voice: z.object({
    provider: z.literal("elevenlabs").default("elevenlabs"),
    voice_id: z.string().default("JBFqnCBsd6RMkjVDRZzb"),
    model_id: z.string().default("eleven_multilingual_v2"),
    pauses: z.object({ sentence: z.number().min(0).max(2).default(0.3), paragraph: z.number().min(0).max(3).default(0.75) }).default({}),
    settings: z.object({ stability: z.number().min(0).max(1).default(0.5), similarity_boost: z.number().min(0).max(1).default(0.75), style: z.number().min(0).max(1).default(0.2), speed: z.number().min(0.7).max(1.2).default(1) }).default({}),
  }).default({}),
});
export type ProjectFileT = z.infer<typeof ProjectFile>;

export const Voice = z.object({
  audio: z.string().nullable().describe("相对项目 public/ 的音频路径；null 表示只有时间轴（测试用）"),
  duration: z.number().positive(),
  words: z.array(z.object({ w: z.string(), s: z.number(), e: z.number() })),
  segments: z.array(z.object({ text: z.string(), s: z.number(), e: z.number(), para: z.number().int() })),
  pauses: z.array(z.object({ s: z.number(), e: z.number() })).default([]),
  source: z.object({ provider: z.string(), model: z.string().optional(), voice_id: z.string().optional(), script_hash: z.string() }),
});
export type VoiceT = z.infer<typeof Voice>;

export const Beat = z.object({
  t: z.number().min(0).describe("绝对时间（秒）"),
  line: z.string().optional().describe("这个节拍对应的旁白"),
  idea: z.string().min(3).describe("视觉想法：画什么具体的东西、用什么隐喻（写代码之前必须先写）"),
  motif: z.string().optional().describe("反复出现的母题 id"),
  focal: z.string().optional().describe("这一拍观众第一眼该看的东西"),
});

export const SceneRef = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("kit"), kit: z.string(), params: z.record(z.any()).default({}) }),
  z.object({ kind: z.literal("local"), entry: z.string().describe("项目内 TS 模块，导出 timeline(params, ctx)"), params: z.record(z.any()).default({}) }),
  z.object({ kind: z.literal("react"), entry: z.string().describe("项目内 TSX，默认导出 Remotion 组件（无 inspect）") , params: z.record(z.any()).default({}) }),
  z.object({ kind: z.literal("html"), entry: z.string().describe("项目内 HTML，实现 window.__vh = { isReady, seek(t), inspect? }") }),
]);
export type SceneRefT = z.infer<typeof SceneRef>;

export const TRANSITIONS = ["cut", "fade", "push-left", "push-up", "zoom", "wipe"] as const;

export const Shot = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  start: z.number().min(0),
  end: z.number().positive(),
  chapter: z.string().optional().describe("设计包章节色板，如 day / night / sepia"),
  scene: SceneRef,
  beats: z.array(Beat).min(1, "每个镜头至少一个节拍（写清视觉想法）"),
  transition: z.object({ kind: z.enum(TRANSITIONS), duration: z.number().min(0).max(1.5).default(0.4) }).default({ kind: "cut", duration: 0 }),
});
export type ShotT = z.infer<typeof Shot>;

export const Storyboard = z.object({
  version: z.literal(2),
  approved: z.boolean().default(false).describe("人工确认后置 true；未确认不能进入构建"),
  semantic: z.record(z.string()).default({}).describe("语义色：实体名 → hex 或调色板角色，全片固定"),
  motifs: z.array(z.object({ id: z.string(), description: z.string() })).default([]),
  captions: z.object({ enabled: z.boolean().default(false) }).default({}),
  music: z.object({ src: z.string(), gain_db: z.number().default(-18), duck_db: z.number().default(10) }).optional(),
  shots: z.array(Shot).min(1),
});
export type StoryboardT = z.infer<typeof Storyboard>;
