// 动效数学：全部是时间的纯函数（seek(t) 约定），任意顺序求任意帧结果都一样。

export const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** CSS 同款 cubic-bezier(x1,y1,x2,y2)：先用牛顿法 + 二分解 x→参数，再求 y。 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sy = (u: number) => ((ay * u + by) * u + cy) * u;
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let u = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(u) - x;
      const d = dx(u);
      if (Math.abs(e) < 1e-6) return sy(u);
      if (Math.abs(d) < 1e-6) break;
      u -= e / d;
    }
    let lo = 0, hi = 1;
    u = x;
    for (let i = 0; i < 30; i++) {
      const v = sx(u);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = u; else hi = u;
      u = (lo + hi) / 2;
    }
    return sy(u);
  };
}

export type Bezier = [number, number, number, number];
const cache = new Map<string, (x: number) => number>();
export function ease(b: Bezier, x: number): number {
  const k = b.join(",");
  let f = cache.get(k);
  if (!f) { f = cubicBezier(...b); cache.set(k, f); }
  return f(x);
}

export interface SpringCfg { stiffness: number; damping: number; mass: number }

/** 弹簧阶跃响应（0→1）的闭式解：状态只是 t 的函数，不需要逐帧积分。 */
export function spring(t: number, c: SpringCfg): number {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(c.stiffness / c.mass);
  const zeta = c.damping / (2 * Math.sqrt(c.stiffness * c.mass));
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  // 临界 / 过阻尼按临界处理
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}

/** start 开始、持续 dur 的 0..1 进度，带缓动。 */
export function progress(t: number, start: number, dur: number, b: Bezier = [0.65, 0, 0.35, 1]): number {
  if (dur <= 0) return t >= start ? 1 : 0;
  return ease(b, clamp((t - start) / dur));
}

/** mulberry32：带种子的确定性随机数。 */
export function seeded(seed: number): () => number {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** 字符串 → 32 位种子 */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 待机呼吸：-1..1 */
export function breathe(t: number, hz: number, phase = 0): number {
  return Math.sin(2 * Math.PI * (hz * t + phase));
}

/** 眨眼：按种子给出确定的眨眼时刻表，返回 0（睁）..1（闭）。 */
export function blink(t: number, every: number, seed: number): number {
  const r = seeded(seed);
  let at = every * (0.3 + 0.5 * r());
  while (at < t + 0.2) {
    const d = t - at;
    if (d >= 0 && d < 0.16) return d < 0.08 ? d / 0.08 : 1 - (d - 0.08) / 0.08;
    at += every * (0.7 + 0.6 * r());
  }
  return 0;
}

/** 关键帧插值：keys 按 at 排序，段内使用缓动。 */
export function keyframes<T extends Record<string, number>>(t: number, keys: Array<{ at: number } & T>, b: Bezier = [0.65, 0, 0.35, 1]): T {
  const strip = (k: { at: number } & T): T => { const { at: _at, ...rest } = k; return rest as unknown as T; };
  if (keys.length === 0) throw new Error("keyframes: 至少需要一个关键帧");
  if (t <= keys[0].at) return strip(keys[0]);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], z = keys[i + 1];
    if (t < z.at) {
      const p = ease(b, (t - a.at) / Math.max(1e-6, z.at - a.at));
      const out: Record<string, number> = {};
      for (const k of Object.keys(strip(a))) out[k] = lerp((a as any)[k], (z as any)[k], p);
      return out as T;
    }
  }
  return strip(keys[keys.length - 1]);
}
