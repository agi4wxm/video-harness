import { z } from "zod";
import { defineKit } from "../kit.ts";
import { text, tint } from "../draw.ts";
import { clamp, ease, progress, seeded } from "../motion.ts";
import type { El } from "../types.ts";

export const scaleZoom = defineKit({
  id: "kit/scale-zoom",
  title: "尺度穿越",
  summary: "一镜到底的连续缩放：身体 → 器官 → 细胞 → 细胞核 → 分子。每一层是上一层里的一个小东西，指数缩放保证速度感均匀。",
  tags: { shot_type: ["zoom", "diagram"], metaphor: ["zoom-detail", "scale-compare"] },
  duration: [3, 12],
  schema: z.object({
    levels: z.array(z.object({
      label: z.string(),
      color: z.string().default("accent"),
      kind: z.enum(["cell", "blob", "ring"]).default("cell"),
    })).min(2).max(6),
    ratio: z.number().min(3).max(20).default(7).describe("相邻两层的尺寸比"),
    holdShare: z.number().min(0.1).max(0.9).default(0.45).describe("每层停留时间占比，其余用于缩放过渡"),
  }),
  examples: [
    {
      name: "身体到 DNA", duration: 8,
      params: { levels: [{ label: "body", color: "accent" }, { label: "kidney", color: "negative", kind: "blob" }, { label: "cell", color: "accent2" }, { label: "nucleus", color: "positive", kind: "ring" }] },
    },
  ],
  timeline(p, { t, dur, W, H, d, seed }) {
    const els: El[] = [];
    const n = p.levels.length;
    const rnd = seeded(seed);
    const R0 = H * 0.36;
    const centers: Array<{ x: number; y: number; r: number }> = [{ x: W / 2, y: H / 2, r: R0 }];
    for (let i = 1; i < n; i++) {
      const prev = centers[i - 1];
      const a = rnd() * Math.PI * 2;
      const off = prev.r * (0.25 + 0.2 * rnd());
      centers.push({ x: prev.x + Math.cos(a) * off, y: prev.y + Math.sin(a) * off, r: prev.r / p.ratio });
    }
    // u ∈ [0, n-1]：当前处在哪一层（小数部分为过渡进度）
    const seg = dur / n;
    const k = Math.min(n - 1, Math.floor(t / seg));
    const local = (t - k * seg) / seg;
    const tr = k >= n - 1 ? 0 : ease(d.motion.ease.inOut, clamp((local - p.holdShare) / (1 - p.holdShare)));
    const u = k + tr;
    const zoom = Math.pow(p.ratio, u);
    const a = centers[Math.floor(u)], b = centers[Math.min(n - 1, Math.floor(u) + 1)];
    const f = u - Math.floor(u);
    const camera = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, zoom };
    for (let i = 0; i < n; i++) {
      const c = centers[i], lv = p.levels[i];
      const screenR = c.r * zoom;
      if (screenR > W * 8 || screenR < 1.5) continue;
      const col = d.color(lv.color);
      els.push({
        type: "ellipse", id: `level${i}`, role: i === Math.round(u) ? "focal" : "decor", x: c.x - c.r, y: c.y - c.r, w: 2 * c.r, h: 2 * c.r,
        fill: lv.kind === "ring" ? tint(d, lv.color, "bgDeep", 0.6) : { radial: [tint(d, lv.color, "surface", 0.25), col] },
        stroke: lv.kind === "ring" ? col : undefined, strokeW: lv.kind === "ring" ? c.r * 0.06 : undefined,
        glow: i === n - 1 ? d.glow : d.glow * 0.3, z: i, scale: 1 + 0.01 * Math.sin(t * 1.3 + i),
      });
      // 每层内部的小颗粒（纹理），下一层的位置留空
      const r2 = seeded(seed + i * 101);
      for (let j = 0; j < 14; j++) {
        const ang = r2() * Math.PI * 2, rr = c.r * (0.2 + 0.65 * Math.sqrt(r2()));
        const dx = c.x + Math.cos(ang) * rr, dy = c.y + Math.sin(ang) * rr;
        const nx = centers[i + 1];
        if (nx && Math.hypot(dx - nx.x, dy - nx.y) < nx.r * 2) continue;
        const s = c.r * (0.03 + 0.04 * r2());
        if (s * zoom < 1) continue;
        els.push({ type: "ellipse", id: `grain${i}:${j}`, role: "decor", x: dx - s, y: dy - s, w: 2 * s, h: 2 * s, fill: tint(d, lv.color, "surface", 0.55), opacity: 0.7, z: i });
      }
    }
    // 屏幕层标签：当前层的名字，过渡时交叉淡化
    const near = Math.round(u);
    const lb = text(d, { id: `label${near}`, text: p.levels[near].label, kind: "title", cx: d.safe.x0, cy: d.safe.y1 - H * 0.06, align: "left", layer: "screen", role: "label", scaleSize: 0.6 });
    const vis = 1 - clamp(Math.abs(u - near) * 4 - 0.6);
    els.push({ ...lb, opacity: vis * progress(t, 0.2, 0.4), z: 100 });
    return { bg: { radial: [d.palette.bg, d.palette.bgDeep] }, camera, els, vignette: d.texture.vignette, grain: d.texture.grain };
  },
});
