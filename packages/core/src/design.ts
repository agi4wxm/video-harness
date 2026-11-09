// 设计体系：调色板角色、按章节换色、语义色、字号、动效变量、安全区、质感。
// 规范 H3：积木参数里只能写颜色 token（调色板角色或语义色名），不能写 hex；hex 只出现在设计包和分镜的 semantic 映射里。
import { z } from "zod";
import illustrated from "./packs/illustrated.ts";
import type { Bezier, SpringCfg } from "./motion.ts";
import { isHex } from "./color.ts";

const Hex = z.string().refine(isHex, "颜色必须是 hex，如 #E2557A");
export const PALETTE_ROLES = ["bg", "bgDeep", "surface", "ink", "inkMuted", "accent", "accent2", "positive", "negative", "glow"] as const;
const Palette = z.object(Object.fromEntries(PALETTE_ROLES.map((r) => [r, Hex])) as Record<(typeof PALETTE_ROLES)[number], typeof Hex>);
const Texture = z.object({ grain: z.number().min(0).max(1), vignette: z.number().min(0).max(1) });
const Bez = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const Spring = z.object({ stiffness: z.number().positive(), damping: z.number().positive(), mass: z.number().positive() });

export const DesignPack = z.object({
  id: z.string(),
  title: z.string(),
  notes: z.string().optional(),
  fonts: z.object({ display: z.string(), sans: z.string(), mono: z.string() }),
  type: z.object({ kicker: z.number(), label: z.number(), caption: z.number(), body: z.number(), title: z.number(), display: z.number(), number: z.number() }),
  palette: Palette,
  chapters: z.record(z.object({ palette: Palette.partial().optional(), texture: Texture.partial().optional() })).default({}),
  motion: z.object({
    enterS: z.number(), staggerS: z.number(),
    ease: z.object({ out: Bez, inOut: Bez, in: Bez }),
    spring: z.object({ pop: Spring, soft: Spring }),
    breatheHz: z.number(), blinkEveryS: z.number(),
  }),
  safe: z.object({ x: z.number().min(0).max(0.2), y: z.number().min(0).max(0.2) }),
  glow: z.number().min(0).max(1),
  texture: Texture,
});
export type DesignPackT = z.infer<typeof DesignPack>;

export const PACKS: Record<string, DesignPackT> = { illustrated: DesignPack.parse(illustrated) };

export type Palette = Record<(typeof PALETTE_ROLES)[number], string>;
export type TypeKey = keyof DesignPackT["type"];

export interface ResolvedDesign {
  id: string;
  chapter: string;
  fonts: DesignPackT["fonts"];
  palette: Palette;
  /** 字号（px） */
  type: Record<TypeKey, number>;
  motion: { enterS: number; staggerS: number; ease: { out: Bezier; inOut: Bezier; in: Bezier }; spring: { pop: SpringCfg; soft: SpringCfg }; breatheHz: number; blinkEveryS: number };
  /** 安全区（px） */
  safe: { x0: number; y0: number; x1: number; y1: number };
  glow: number;
  texture: { grain: number; vignette: number };
  semantic: Record<string, string>;
  /** token → hex：调色板角色 → 语义色 → 报错 */
  color(token: string): string;
  hasColor(token: string): boolean;
}

export function resolveDesign(pack: DesignPackT, opts: { W: number; H: number; chapter?: string; semantic?: Record<string, string> }): ResolvedDesign {
  const chapter = opts.chapter ?? "day";
  const ch = pack.chapters[chapter];
  if (opts.chapter && !ch) throw new Error(`设计包 ${pack.id} 没有章节色板 "${chapter}"（可用：${Object.keys(pack.chapters).join(", ")}）`);
  const palette = { ...pack.palette, ...(ch?.palette ?? {}) } as Palette;
  const semantic: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.semantic ?? {})) semantic[k] = isHex(v) ? v : (palette as any)[v] ?? v;
  const has = (t: string) => t in palette || t in semantic;
  const { W, H } = opts;
  return {
    id: pack.id,
    chapter,
    fonts: pack.fonts,
    palette,
    type: Object.fromEntries(Object.entries(pack.type).map(([k, v]) => [k, Math.round(v * H)])) as Record<TypeKey, number>,
    motion: pack.motion as ResolvedDesign["motion"],
    safe: { x0: pack.safe.x * W, y0: pack.safe.y * H, x1: W - pack.safe.x * W, y1: H - pack.safe.y * H },
    glow: pack.glow,
    texture: { ...pack.texture, ...(ch?.texture ?? {}) },
    semantic,
    hasColor: has,
    color(token: string) {
      if (token in palette) return (palette as any)[token];
      if (token in semantic) return semantic[token];
      throw new Error(`未知颜色 token "${token}"：只能用调色板角色（${PALETTE_ROLES.join(" / ")}）或分镜 semantic 中定义的语义色`);
    },
  };
}

export function loadPack(ref: string, custom?: unknown): DesignPackT {
  if (custom) return DesignPack.parse(custom);
  const p = PACKS[ref];
  if (!p) throw new Error(`未知设计包 "${ref}"（内置：${Object.keys(PACKS).join(", ")}；或在项目里放 design.json）`);
  return p;
}
