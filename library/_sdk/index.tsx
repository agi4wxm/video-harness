// 积木 SDK：所有 library 中的代码组件只通过这里拿主题、动效和段信息。
// 规范 H3：颜色、字体、字号、时长、缓动只能引用这里的设计变量，不许写死数值。
import React, { createContext, useContext } from "react";
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export type StyleTokens = {
  color: Record<string, string>;
  font: { sans: string; display: string; mono: string };
  type: { caption: number; label: number; body: number; title: number; display: number; banner: number };
  layout: {
    frame: { x0: number; x1: number; y0: number; y1: number };
    titleBar: { h: number };
    content: { x0: number; x1: number; y0: number; y1: number };
    captionBand: { y0: number; y1: number };
    banner: { x0: number; x1: number; y0: number; y1: number };
    radius: number;
    captionMaxChars: number;
  };
};

export type MotionTokens = {
  enterS: number;
  exitS: number;
  staggerS: number;
  charStaggerS: number;
  popShare: number;
  slide: { sm: number; md: number; lg: number };
  ease: { out: number[]; inOut: number[]; in: number[] };
  spring: { pop: SpringCfg; soft: SpringCfg };
  kenBurnsScale: number;
  drawS: number;
};
type SpringCfg = { damping: number; stiffness: number; mass: number };

export type Theme = { style: StyleTokens; motion: MotionTokens; W: number; H: number };

export const ThemeContext = createContext<Theme | null>(null);
export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  if (!t) throw new Error("useTheme 必须在 runtime 的 ThemeContext 内使用");
  return t;
}

export type ColorName =
  | "fg" | "fgMuted" | "fgDim" | "accent" | "accent2" | "positive" | "negative" | "bg" | "panel" | "panelBorder";

export function useColor(name: ColorName): string {
  return useTheme().style.color[name];
}

/** 字号：按画布高度换算为 px。 */
export function useFontPx(kind: keyof StyleTokens["type"]): number {
  const t = useTheme();
  return Math.round(t.style.type[kind] * t.H);
}

// ------------------------------------------------------------------ 段（segment）信息

export type SegmentInfo = {
  id: string;
  durationInFrames: number;
  /** 内容区像素尺寸 */
  box: { w: number; h: number };
  /** 段内节拍（相对段起点的帧号），来自分镜 beats */
  beats: number[];
};

export const SegmentContext = createContext<SegmentInfo | null>(null);
export function useSegment(): SegmentInfo {
  const s = useContext(SegmentContext);
  if (!s) throw new Error("useSegment 必须在 runtime 的 SegmentContext 内使用");
  return s;
}

// ------------------------------------------------------------------ 动效

export function useSec() {
  const { fps } = useVideoConfig();
  return (s: number) => Math.round(s * fps);
}

function bez(p: number[]) {
  return Easing.bezier(p[0], p[1], p[2], p[3]);
}

export type EnterFrom = "none" | "bottom" | "top" | "left" | "right";
export type EnterOpts = {
  /** 相对段起点的延迟（秒） */
  delayS?: number;
  from?: EnterFrom;
  distance?: keyof MotionTokens["slide"];
  /** pop：弹簧缩放入场；fade：只淡入；slide：淡入 + 位移 */
  mode?: "slide" | "pop" | "fade" | "cut";
};

/** 统一入场动效：返回 style。所有积木都用它，保证全片动效语言一致。 */
export function useEnter(opts: EnterOpts = {}): React.CSSProperties {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useTheme();
  const m = t.motion;
  const start = Math.round((opts.delayS ?? 0) * fps);
  const f = frame - start;
  const mode = opts.mode ?? "slide";
  if (mode === "cut") return { opacity: f >= 0 ? 1 : 0 };
  if (mode === "pop") {
    const s = spring({ frame: f, fps, config: m.spring.pop });
    return { opacity: f >= 0 ? Math.min(1, f / 3) : 0, transform: `scale(${0.6 + 0.4 * s})` };
  }
  const dur = Math.max(1, Math.round(m.enterS * fps));
  const p = interpolate(f, [0, dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: bez(m.ease.out) });
  if (mode === "fade" || (opts.from ?? "bottom") === "none") return { opacity: p };
  const d = m.slide[opts.distance ?? "sm"] * Math.min(t.W, t.H) * (1 - p);
  const from = opts.from ?? "bottom";
  const tr = from === "bottom" ? `translateY(${d}px)` : from === "top" ? `translateY(${-d}px)` : from === "left" ? `translateX(${-d}px)` : `translateX(${d}px)`;
  return { opacity: p, transform: tr };
}

/** 0→1 的进度（描线、计数等），使用主题缓动。 */
export function useProgress(delayS: number, durS?: number, ease: "out" | "inOut" = "inOut"): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const m = useTheme().motion;
  const start = Math.round(delayS * fps);
  const dur = Math.max(1, Math.round((durS ?? m.drawS) * fps));
  return interpolate(frame - start, [0, dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: bez(m.ease[ease]) });
}

/** 弹簧值 0→1（带过冲），用于强调。 */
export function usePop(delayS: number): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const m = useTheme().motion;
  return spring({ frame: frame - Math.round(delayS * fps), fps, config: m.spring.pop });
}

/** 逐个出现的间隔（秒），来自动效 token。 */
export function useStagger(): (i: number) => number {
  const m = useTheme().motion;
  return (i: number) => i * m.staggerS;
}

/** 确定性伪随机（规范 H2：禁止未加种子的 Math.random）。 */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}
