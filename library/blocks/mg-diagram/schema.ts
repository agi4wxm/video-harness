import { z } from "zod";

const colorName = z.enum(["fg", "fgMuted", "accent", "accent2", "positive", "negative"]);

export const schema = z.object({
  title: z.string().optional().describe("内容区顶部的小标题（可选）"),
  nodes: z
    .array(
      z.object({
        id: z.string(),
        label: z.string().optional().describe("节点下方 / 内部的文字"),
        glyph: z.string().optional().describe("圆形节点内的符号，如 + − e⁻ Li⁺"),
        shape: z.enum(["circle", "pill", "box"]).default("circle"),
        x: z.number().min(0).max(1).describe("内容区内的水平位置（0–1）"),
        y: z.number().min(0).max(1).describe("内容区内的垂直位置（0–1）"),
        size: z.enum(["sm", "md", "lg"]).default("md"),
        color: colorName.default("fg"),
      }),
    )
    .min(1)
    .max(12),
  edges: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        label: z.string().optional(),
        style: z.enum(["line", "arrow", "flow"]).default("arrow").describe("flow：沿线流动的粒子，表示物质 / 能量 / 电荷流动"),
        color: colorName.default("fgMuted"),
      }),
    )
    .default([]),
  steps: z
    .array(
      z.object({
        at: z.number().min(0).describe("相对本段起点的秒数"),
        show: z.array(z.string()).default([]).describe("此时出现的节点 / 边（边的 id 为 from>to）"),
        emphasize: z.array(z.string()).default([]).describe("此时被强调（脉冲光环）的节点"),
      }),
    )
    .default([])
    .describe("分步揭示；为空时全部元素依次入场"),
});

export type Params = z.infer<typeof schema>;
