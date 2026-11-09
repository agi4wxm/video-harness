// 积木共用的绘制助手：都返回场景图元素，不碰 DOM。
import { mix } from "./color.ts";
import type { ResolvedDesign, TypeKey } from "./design.ts";
import { clamp, progress, spring } from "./motion.ts";
import { fitSize, textBox } from "./text.ts";
import type { Base, PathEl, Role, TextEl } from "./types.ts";

export interface TextOpts {
  id: string;
  text: string;
  kind: TypeKey;
  cx: number;
  cy: number;
  color?: string;
  font?: "display" | "sans" | "mono";
  weight?: number;
  align?: "left" | "center" | "right";
  maxW?: number;
  role?: Role;
  layer?: "world" | "screen";
  on?: string;
  scaleSize?: number;
}

export function text(d: ResolvedDesign, o: TextOpts): TextEl {
  const font = o.font ?? (o.kind === "title" || o.kind === "display" || o.kind === "number" ? "display" : "sans");
  let size = Math.round(d.type[o.kind] * (o.scaleSize ?? 1));
  if (o.maxW) size = fitSize(o.text, size, o.maxW, font);
  const b = textBox(o.text, size, font, o.cx, o.cy, o.align ?? "center");
  return {
    type: "text", id: o.id, text: o.text, font, size, weight: o.weight ?? (font === "display" ? 600 : 600),
    color: d.color(o.color ?? "ink"), align: o.align ?? "center", role: o.role ?? "label", layer: o.layer, on: o.on,
    ...b,
  };
}

/** 统一入场：淡入 + 上移。返回要合并进元素的字段。 */
export function enter(d: ResolvedDesign, t: number, at: number, H: number, dist = 0.03): Partial<Base> & { dy: number } {
  const p = progress(t, at, d.motion.enterS, d.motion.ease.out);
  return { opacity: clamp((t - at) / (d.motion.enterS * 0.6)), dy: (1 - p) * H * dist };
}

/** 弹出：弹簧缩放 */
export function pop(d: ResolvedDesign, t: number, at: number, from = 0.4): { opacity: number; scale: number } {
  if (t < at) return { opacity: 0, scale: from };
  return { opacity: clamp((t - at) / 0.12), scale: from + (1 - from) * spring(t - at, d.motion.spring.pop) };
}

/** 一次性脉冲：0→1→0，用于强调 */
export function pulse(t: number, at: number, dur = 0.5): number {
  const x = (t - at) / dur;
  return x < 0 || x > 1 ? 0 : Math.sin(Math.PI * x);
}

export function shift<T extends Base>(el: T, dy: number): T {
  return { ...el, y: el.y + dy };
}

/** 直线路径元素：框为两端点外包 */
export function line(id: string, x0: number, y0: number, x1: number, y1: number, o: Partial<PathEl> = {}): PathEl {
  const pad = (o.strokeW ?? 4) * 2;
  const x = Math.min(x0, x1) - pad, y = Math.min(y0, y1) - pad;
  return {
    type: "path", id, x, y, w: Math.abs(x1 - x0) + 2 * pad, h: Math.abs(y1 - y0) + 2 * pad,
    d: `M ${x0 - x} ${y0 - y} L ${x1 - x} ${y1 - y}`, length: Math.hypot(x1 - x0, y1 - y0), cap: "round", role: "decor", ...o,
  };
}

export const tint = (d: ResolvedDesign, token: string, toward: string, t: number) => mix(d.color(token), d.color(toward), t);

export function fmtNumber(v: number, decimals = 0): string {
  const s = v.toFixed(decimals);
  const [i, f] = s.split(".");
  const ii = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return f ? `${ii}.${f}` : ii;
}
