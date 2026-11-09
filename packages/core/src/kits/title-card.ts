import { z } from "zod";
import { defineKit } from "../kit.ts";
import { enter, line, pop, shift, text, tint } from "../draw.ts";
import { breathe, progress, seeded } from "../motion.ts";
import type { El } from "../types.ts";

export const titleCard = defineKit({
  id: "kit/title-card",
  title: "章节标题卡",
  summary: "章节开场：小标题 + 大标题 + 描线下划线 + 漂浮光球 / 放射光；用于段落切换和开头钩子后的定题。",
  tags: { shot_type: ["kinetic-text", "chapter-card"], metaphor: ["none"] },
  duration: [1.6, 4.5],
  schema: z.object({
    kicker: z.string().optional().describe("标题上方的小字，如 CHAPTER 2 / 第二部分"),
    title: z.string().min(1),
    subtitle: z.string().optional(),
    color: z.string().default("accent").describe("强调色 token（下划线、光球）"),
    decor: z.enum(["orbs", "rays", "none"]).default("orbs"),
    align: z.enum(["center", "left"]).default("center"),
  }),
  examples: [
    { name: "章节开场", duration: 3, params: { kicker: "PART 2", title: "What the drug actually does", subtitle: "inside a single cell", decor: "orbs" } },
  ],
  timeline(p, { t, W, H, d, seed }) {
    const els: El[] = [];
    const rnd = seeded(seed);
    if (p.decor === "orbs") {
      for (let i = 0; i < 7; i++) {
        const r = H * (0.05 + 0.12 * rnd());
        const edge = rnd();
        const cx = edge < 0.5 ? W * (0.04 + 0.22 * rnd()) : W * (0.74 + 0.22 * rnd());
        const cy = H * (0.12 + 0.76 * rnd());
        const drift = breathe(t, 0.08 + 0.05 * rnd(), rnd());
        els.push({
          type: "ellipse", id: `orb${i}`, role: "decor", z: 0,
          x: cx - r + drift * W * 0.01, y: cy - r - drift * H * 0.015, w: 2 * r, h: 2 * r,
          fill: { radial: [tint(d, p.color, "bg", 0.25), tint(d, p.color, "bg", 0.8)] },
          opacity: 0.55 * progress(t, 0.05 * i, 0.6), glow: d.glow * 0.6,
        });
      }
    } else if (p.decor === "rays") {
      const n = 14, R = Math.hypot(W, H) * 0.6;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + t * 0.06;
        els.push(line(`ray${i}`, W / 2, H / 2, W / 2 + Math.cos(a) * R, H / 2 + Math.sin(a) * R, {
          stroke: tint(d, p.color, "bg", 0.7), strokeW: H * 0.05, cap: "butt", opacity: 0.35 * progress(t, 0, 0.8), z: 0,
        }));
      }
    }
    const cx = p.align === "center" ? W / 2 : d.safe.x0 + W * 0.04;
    const maxW = (d.safe.x1 - d.safe.x0) * 0.9;
    let y = H * 0.5;
    const title = text(d, { id: "title", text: p.title, kind: "title", cx, cy: y, align: p.align, maxW, role: "title" });
    const tp = pop(d, t, 0.3, 0.85);
    els.push({ ...title, opacity: tp.opacity, scale: tp.scale, z: 3 });
    if (p.kicker) {
      const k = text(d, { id: "kicker", text: p.kicker, kind: "kicker", cx, cy: title.y - H * 0.045, align: p.align, color: "inkMuted", weight: 700, role: "kicker" });
      const e = enter(d, t, 0.12, H);
      els.push({ ...shift(k, e.dy), opacity: e.opacity, z: 3 });
    }
    const uy = title.y + title.h + H * 0.02;
    const uw = Math.min(title.w * 0.55, W * 0.3);
    const ux0 = p.align === "center" ? W / 2 - uw / 2 : title.x;
    els.push({
      ...line("underline", ux0, uy, ux0 + uw, uy, { stroke: d.color(p.color), strokeW: H * 0.012 }),
      progress: progress(t, 0.6, 0.5, d.motion.ease.out), glow: d.glow, z: 2,
    });
    y = uy + H * 0.07;
    if (p.subtitle) {
      const s = text(d, { id: "subtitle", text: p.subtitle, kind: "body", cx, cy: y, align: p.align, color: "inkMuted", maxW, role: "body" });
      const e = enter(d, t, 0.8, H);
      els.push({ ...shift(s, e.dy), opacity: e.opacity, z: 3 });
    }
    return { bg: { linear: [d.palette.bg, d.palette.bgDeep], angle: 180 }, els, vignette: d.texture.vignette, grain: d.texture.grain };
  },
});
