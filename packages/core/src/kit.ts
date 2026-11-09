// 积木（kit）约定：参数 schema + 纯函数 timeline(params, ctx) → SceneFrame。
// 与 create-vibe-motion 的 timeline / Scene 分离同理，但 Scene 由 runtime 统一实现，积木只描述"画什么"。
import type { z } from "zod";
import type { ResolvedDesign } from "./design.ts";
import type { SceneFrame } from "./types.ts";

export interface KitCtx {
  /** 镜头内时间（秒） */
  t: number;
  /** 镜头时长（秒） */
  dur: number;
  fps: number;
  W: number;
  H: number;
  d: ResolvedDesign;
  /** 镜头级种子（由镜头 id 派生），所有随机都从这里来 */
  seed: number;
  /** 分镜节拍时刻（镜头内秒数），积木可以把动作对齐到节拍 */
  beats: number[];
}

export interface KitExample<P> { name: string; duration: number; params: P }

export interface Kit<S extends z.ZodTypeAny = z.ZodTypeAny> {
  id: string;
  title: string;
  summary: string;
  /** 与分析阶段共用的词表：shot_type / metaphor */
  tags: { shot_type: string[]; metaphor: string[] };
  /** 推荐时长区间（秒） */
  duration: [number, number];
  schema: S;
  examples: KitExample<z.input<S>>[];
  timeline(p: z.output<S>, ctx: KitCtx): SceneFrame;
}

export function defineKit<S extends z.ZodTypeAny>(k: Kit<S>): Kit<S> {
  return Object.freeze(k);
}
