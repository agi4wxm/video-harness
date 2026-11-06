import { z } from "zod";

export const schema = z.object({
  src: z.string().describe("素材路径，相对项目 public/ 目录（由 asset_use 复制进来），如 assets/phone-charging.webp"),
  kind: z.enum(["image", "video"]).default("image"),
  move: z.enum(["in", "out", "left", "right", "none"]).default("in").describe("缓慢推拉 / 平移（Ken Burns）"),
  focus: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).default({ x: 0.5, y: 0.5 }).describe("推镜的中心"),
  dim: z.number().min(0).max(0.8).default(0).describe("压暗，便于叠加文字"),
  callouts: z
    .array(
      z.object({
        at: z.number().min(0).describe("相对本段起点的秒数"),
        text: z.string(),
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        color: z.enum(["accent", "accent2", "positive", "negative", "fg"]).default("accent2"),
      }),
    )
    .default([]),
  box: z
    .object({
      at: z.number().min(0),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      w: z.number().min(0).max(1),
      h: z.number().min(0).max(1),
    })
    .optional()
    .describe("在指定时刻描出的高亮框"),
});

export type Params = z.infer<typeof schema>;
