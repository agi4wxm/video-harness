// 分镜与语音的数据格式（docs/00 §5）。运行时与渲染脚本共用。
import { z } from "zod";

export const AssetRef = z.string().regex(/^[a-z0-9.]+\/[a-z0-9-]+(@\d+(\.\d+){0,2})?$/, "素材引用格式：kind/name[@版本]");

export const Shot = z.object({
  id: z.string(),
  start: z.number().min(0),
  end: z.number().positive(),
  text: z.string().optional(),
  block: AssetRef,
  params: z.record(z.any()).default({}),
  intent: z
    .object({
      focal: z.string().optional(),
      metaphor: z.string().optional(),
      emphasis_words: z.array(z.string()).optional(),
      motion: z.string().optional(),
    })
    .optional(),
  beats: z.array(z.object({ t: z.number(), word: z.string().optional(), event: z.string().optional(), sfx: z.string().optional() })).default([]),
});

export const Storyboard = z.object({
  version: z.literal(1),
  canvas: z.object({ w: z.number().int(), h: z.number().int(), fps: z.number().int() }),
  style: AssetRef.default("preset.style/mono-window"),
  motion: AssetRef.default("preset.motion/standard"),
  template: z
    .object({ id: AssetRef.default("element/window-frame"), topic: z.string(), tag: z.string().optional() })
    .optional(),
  shots: z.array(Shot).min(1),
  transitions: z
    .array(z.object({ between: z.tuple([z.string(), z.string()]), asset: AssetRef, duration_s: z.number().min(0.05).max(1.5) }))
    .default([]),
  music: z.object({ asset: z.string(), duck_db: z.number().optional(), src: z.string().optional() }).optional(),
});

export const Voice = z.object({
  audio: z.string().optional().describe("相对 public/ 的音频路径"),
  words: z.array(z.object({ w: z.string(), s: z.number(), e: z.number() })),
  segments: z.array(z.object({ text: z.string(), s: z.number(), e: z.number() })),
});

export type StoryboardT = z.infer<typeof Storyboard>;
export type VoiceT = z.infer<typeof Voice>;
export type MainProps = { storyboard: StoryboardT; voice: VoiceT | null };

export function stripVersion(ref: string): string {
  return ref.split("@")[0];
}
