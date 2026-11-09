// 条目档案（entry.yaml）的格式。所有类型共用一个头部；类型专属内容放在 spec 里，
// 草稿阶段 spec 可以不完整，提交审查前由 lint 按分类体系的 requiredForReview 检查。
import { z } from "zod";
import { ALL_TYPES } from "./taxonomy.ts";

export const STATUSES = ["draft", "review", "approved", "deprecated"] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<Status, string> = { draft: "草稿", review: "待审", approved: "已通过", deprecated: "已弃用" };

export const PROVENANCE_KINDS = ["made", "decomposed", "generated", "licensed", "user-provided"] as const;
export const PROVENANCE_LABEL: Record<(typeof PROVENANCE_KINDS)[number], string> = {
  made: "自制", decomposed: "拆解自参考视频", generated: "模型生成", licensed: "外部授权", "user-provided": "用户提供",
};
export const RESTRICTIONS = ["real-person", "brand", "editorial-only", "internal-reference", "no-commercial"] as const;

/** 文件引用：条目目录内的相对路径，或内容寻址的大文件 blob:sha256:<64hex>.<ext> */
export const FileRef = z.string().refine((s) => /^blob:sha256:[0-9a-f]{64}(\.[a-z0-9]+)?$/.test(s) || (!s.startsWith("/") && !s.includes("..")), "文件引用必须是条目内相对路径或 blob:sha256:…");

export const ID_RE = /^[a-z]+\.[a-z0-9-]+\/[a-z0-9][a-z0-9-]*$/;
export const DEP_RE = /^[a-z]+\.[a-z0-9-]+\/[a-z0-9][a-z0-9-]*(@\d+(\.\d+){0,2})?$/;

export const Entry = z.object({
  id: z.string().regex(ID_RE, "id 格式：<大类>.<小类>/<短名>，如 content.model3d/minicar-teal"),
  type: z.enum(ALL_TYPES as [string, ...string[]]),
  version: z.string().regex(/^\d+\.\d+\.\d+$/).default("0.1.0"),
  title: z.string().min(1),
  summary: z.string().default(""),
  tags: z.record(z.array(z.string())).default({}),
  styles: z.array(z.string()).default([]).describe("适用的风格包 id"),
  status: z.enum(STATUSES).default("draft"),
  provenance: z.object({
    kind: z.enum(PROVENANCE_KINDS),
    source: z.string().optional(),
    derived_from: z.array(z.string()).default([]).describe("如 reference.video/hoverslam#t=11-16"),
    generator: z.object({ model: z.string(), prompt: z.string().optional(), params: z.record(z.unknown()).optional() }).optional(),
    license: z.string().optional(),
    attribution: z.string().optional(),
    restrictions: z.array(z.enum(RESTRICTIONS)).default([]),
  }),
  files: z.record(FileRef).default({}),
  previews: z.array(FileRef).default([]),
  cover: FileRef.optional().describe("卡片封面，默认取第一张预览图"),
  deps: z.array(z.string().regex(DEP_RE)).default([]),
  spec: z.record(z.unknown()).default({}),
  usage: z.object({ projects: z.array(z.string()).default([]), count: z.number().int().default(0), rating: z.number().min(0).max(5).optional() }).default({}),
  created: z.string(),
  updated: z.string(),
  notes: z.string().optional(),
});
export type EntryT = z.infer<typeof Entry>;
export type EntryInput = z.input<typeof Entry>;

export const Review = z.object({
  date: z.string(),
  reviewer: z.string(),
  verdict: z.enum(["approve", "reject", "comment"]),
  version: z.string(),
  checklist: z.record(z.enum(["pass", "fail", "n/a"])).default({}),
  notes: z.string().default(""),
  images: z.array(z.string()).default([]),
});
export type ReviewT = z.infer<typeof Review>;

export const LibraryFile = z.object({
  name: z.string(),
  schema: z.literal(1).default(1),
  description: z.string().default(""),
  blobs: z.string().default("blobs").describe("大文件目录（相对素材库根目录），不进 git"),
});
export type LibraryFileT = z.infer<typeof LibraryFile>;

/** 每个小类的审查清单（通用项 + 类型项），审查记录按此逐项打勾 */
export const COMMON_CHECKLIST = ["预览能完整展示这条素材", "来源与授权信息完整", "与所属风格包一致", "命名与标签清楚，能被检索到"];
export const TYPE_CHECKLIST: Record<string, string[]> = {
  style: ["风格帧与参考片并排比较，达到同一档次", "颜色语义没有冲突，对比度合格"],
  "content.model3d": ["造型、材质、光影写实度达标", "部件已拆分并命名", "四视图无破绽", "单位 / 朝向 / 原点规范"],
  "content.scene3d": ["空场景单独看耐看", "主体放进去协调", "机位预设可用"],
  "content.vector": ["剪影一眼可辨", "各状态一致", "小尺寸下清晰"],
  "content.image": ["质感与构图达标", "无生成瑕疵（乱码文字、结构错误）", "不涉及未授权的真实人物 / 品牌"],
  "content.footage": ["画质与帧率达标", "可用区间标注准确"],
  "content.typography": ["实际尺寸下可读", "符合字体规范"],
  data: ["合理性校验通过", "关键结论能复现", "通道与单位清楚"],
  effect: ["样片里动作本身好看", "符合动效语言", "换一组参数依然成立", "画面只由时间决定（确定性）"],
  sound: ["试听通过", "响度与起音点准确"],
  structure: ["能套用到另一个题目", "节拍描述可执行"],
  knowledge: ["出处可靠且可访问", "表述与出处一致"],
  reference: ["逐段拆解完整（结构 / 风格 / 效果 / 素材 / 声音）", "派生条目都已登记"],
};
export function checklistFor(type: string): string[] {
  const cat = type.split(".")[0];
  return [...COMMON_CHECKLIST, ...(TYPE_CHECKLIST[cat] ?? []), ...(TYPE_CHECKLIST[type] ?? [])];
}
