// L5 封闭词表（v0）。同时也是素材库的标签词表，见 docs/01 §3.2、docs/03 §2。
import { z } from "zod";

export const SHOT_TYPE = [
  "kinetic-text", "stat-number", "chart-bar", "chart-line", "chart-pie", "comparison-split",
  "process-flow", "timeline", "map", "3d-object", "3d-scene", "ui-mockup", "logo", "icon-grid",
  "quote", "list", "diagram", "live-footage", "talking-head", "screenshot", "generative-footage", "other",
] as const;

export const METAPHOR = [
  "growth-rise", "decline-fall", "contrast-split", "accumulation-stack", "flow-path",
  "cause-effect-arrow", "zoom-detail", "reveal-mask", "transform-morph", "scale-compare", "none",
] as const;

export const FOCAL_POSITION = ["center", "upper-third", "lower-third", "left", "right", "full-frame"] as const;

export const EMPHASIS = ["color", "scale", "weight", "underline-marker", "box", "motion-pop", "none"] as const;

export const CUT_IN = ["hard-cut", "match-cut", "j-cut", "l-cut", "beat-cut", "jump-cut", "transition", "breath"] as const;

export const ShotLabel = z.object({
  shot_id: z.string().describe("shots.json 中的镜头 id，如 s003"),
  shot_type: z.enum(SHOT_TYPE),
  metaphor: z.enum(METAPHOR),
  focal_position: z.enum(FOCAL_POSITION),
  emphasis_treatment: z.enum(EMPHASIS),
  concepts_per_shot: z.union([z.literal(1), z.literal(2), z.literal("3+")]),
  cut_in: z.enum(CUT_IN),
  visualized_words: z.array(z.string()).describe("文案中被画出来的词"),
  evidence_t: z.number().describe("作答依据的时间点（秒）"),
  note: z.string().optional(),
});

export type ShotLabelT = z.infer<typeof ShotLabel>;

export const VOCAB = {
  shot_type: SHOT_TYPE,
  metaphor: METAPHOR,
  focal_position: FOCAL_POSITION,
  emphasis_treatment: EMPHASIS,
  concepts_per_shot: [1, 2, "3+"],
  cut_in: CUT_IN,
};
