// 本地镜头：一束白光打到一个氮气分子上，光向四面八方散开；蓝光散射得比红光多得多。
// 只依赖 ctx（时间、设计变量、种子），所以 vh 能在 Node 里求值做版面校验。
import type { El, KitCtx, SceneFrame } from "@video-harness/core";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let r = Math.imul(a ^ (a >>> 15), 1 | a); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (x: number) => Math.min(1, Math.max(0, x));

export function timeline(params: { countAt?: number }, ctx: KitCtx): SceneFrame {
  const { t, W, H, d, seed } = ctx;
  const cx = W * 0.52, cy = H * 0.5;
  const els: El[] = [];
  // 白光光束：从左侧画入
  const beamP = clamp(t / 0.7);
  els.push({ type: "path", id: "beam", role: "decor", x: 0, y: cy - H * 0.02, w: cx, h: H * 0.04, d: `M 0 ${H * 0.02} L ${cx - H * 0.08} ${H * 0.02}`, stroke: "#FFFFFF", strokeW: H * 0.022, progress: beamP, glow: d.glow, glowColor: d.color("glow"), z: 1 });
  // 散射光子：每 0.07s 发出一个，5/6 为蓝、1/6 为红；红光大多沿原方向继续
  const r = rng(seed);
  const photons = Array.from({ length: 120 }, (_, i) => {
    const blue = r() < 5 / 6;
    const ang = blue ? r() * Math.PI * 2 : (r() - 0.5) * 0.6;
    return { t0: 0.7 + i * 0.07, ang, blue, speed: H * (0.45 + 0.25 * r()) };
  });
  for (const [i, p] of photons.entries()) {
    const age = t - p.t0;
    if (age < 0 || age > 2.2) continue;
    const dist = H * 0.09 + p.speed * age;
    const x = cx + Math.cos(p.ang) * dist, y = cy + Math.sin(p.ang) * dist;
    const tail = H * 0.05;
    const x0 = x - Math.cos(p.ang) * tail, y0 = y - Math.sin(p.ang) * tail;
    const bx = Math.min(x, x0) - 4, by = Math.min(y, y0) - 4;
    els.push({ type: "path", id: `ph${i}`, role: "decor", x: bx, y: by, w: Math.abs(x - x0) + 8, h: Math.abs(y - y0) + 8, d: `M ${x0 - bx} ${y0 - by} L ${x - bx} ${y - by}`,
      stroke: d.color(p.blue ? "blue" : "red"), strokeW: H * 0.008, opacity: clamp(1.6 - age), glow: d.glow * 0.6, z: 2 });
  }
  // 分子（N₂）：两个原子，带轻微振动
  const wob = Math.sin(t * 9) * H * 0.004;
  for (const [k, s] of [-1, 1].entries()) {
    const rr = H * 0.055;
    els.push({ type: "ellipse", id: `atom${k}`, role: "focal", x: cx + s * H * 0.045 - rr + s * wob, y: cy - rr, w: 2 * rr, h: 2 * rr, fill: { radial: [d.color("surface"), d.color("accent2")] }, glow: d.glow * 0.5, z: 3 });
  }
  // 节拍 2：计数标签
  const at = params.countAt ?? 3.9;
  const show = clamp((t - at) / 0.4);
  const size = d.type.body;
  const mk = (id: string, text: string, color: string, x: number, y: number): El => ({ type: "text", id, text, font: "display", size: size * 1.3, weight: 700, color, on: d.palette.bg, x, y, w: text.length * size * 1.3 * 0.6, h: size * 1.6, opacity: show, scale: 0.8 + 0.2 * show, role: "label", z: 4 });
  els.push(mk("blueCount", "blue ×5", d.color("blue"), W * 0.68, H * 0.2));
  els.push(mk("redCount", "red ×1", d.color("red"), W * 0.68, H * 0.29));
  return { bg: { radial: [d.palette.surface, d.palette.bgDeep] }, els, vignette: d.texture.vignette, grain: d.texture.grain };
}
