// 本地镜头示例：一个发光的分子在路径上移动，到达时脉冲一下。
// 只用 ctx 提供的设计变量与时间；不 import 任何运行时代码，这样 vh 在 Node 里也能求值（inspect）。
import type { KitCtx, SceneFrame } from "@video-harness/core";

export function timeline(params: { label?: string }, ctx: KitCtx): SceneFrame {
  const { t, W, H, d } = ctx;
  const p = Math.min(1, Math.max(0, (t - 0.3) / 1.6));
  const e = 1 - Math.pow(1 - p, 3);
  const x = W * (0.2 + 0.6 * e), y = H * 0.5 - Math.sin(e * Math.PI) * H * 0.12;
  const pulse = t > 1.9 && t < 2.5 ? Math.sin(((t - 1.9) / 0.6) * Math.PI) : 0;
  const r = H * 0.06 * (1 + 0.25 * pulse);
  const label = params.label ?? "molecule";
  const size = d.type.label;
  const w = label.length * size * 0.55;
  return {
    bg: { linear: [d.palette.bg, d.palette.bgDeep], angle: 180 },
    els: [
      { type: "ellipse", id: "target", x: W * 0.8 - H * 0.09, y: H * 0.5 - H * 0.09, w: H * 0.18, h: H * 0.18, fill: d.color("surface"), stroke: d.color("accent2"), strokeW: H * 0.006, role: "decor" },
      { type: "ellipse", id: "mol", x: x - r, y: y - r, w: 2 * r, h: 2 * r, fill: { radial: [d.color("glow"), d.color("positive")] }, glow: d.glow, role: "focal" },
      { type: "text", id: "label", text: label, font: "sans", size, weight: 700, color: d.color("ink"), x: x - w / 2, y: y + r + size * 0.4, w, h: size * 1.25, opacity: Math.min(1, t / 0.4), role: "label" },
    ],
  };
}
