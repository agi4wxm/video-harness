import { z } from "zod";

export const schema = z.object({
  lines: z.array(z.string().min(1)).min(1).max(3).describe("1–3 行大字，每行建议 ≤ 8 字"),
  emphasis: z.array(z.string()).default([]).describe("需要强调的词（必须出现在 lines 中），强调色 + 弹出"),
  subtitle: z.string().optional().describe("大字下方的一行小字"),
  size: z.enum(["title", "display"]).default("display"),
  mode: z.enum(["chars", "lines", "pop"]).default("chars").describe("chars：逐字入场；lines：逐行滑入；pop：整体弹出"),
});

export type Params = z.infer<typeof schema>;
