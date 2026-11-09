import { z } from "zod";
import { defineKit } from "../kit.ts";
import { enter, fmtNumber, pop, pulse, shift, text } from "../draw.ts";
import { clamp, lerp, progress } from "../motion.ts";
import type { El } from "../types.ts";

export const statCrowd = defineKit({
  id: "kit/stat-crowd",
  title: "人群单位图",
  summary: "一群小人里有多少变色：比例 / 生存率 / 占比，右侧大数字同步计数。把数字画成具体的人，而不是柱子。",
  tags: { shot_type: ["stat-number", "icon-grid"], metaphor: ["growth-rise", "decline-fall", "scale-compare"] },
  duration: [2.5, 7],
  schema: z.object({
    total: z.number().int().min(10).max(300).default(100),
    cols: z.number().int().min(2).max(30).optional(),
    from: z.number().min(0).max(1).default(0).describe("起始比例"),
    to: z.number().min(0).max(1).describe("终止比例"),
    at: z.number().min(0).default(0.9).describe("开始变色的时刻（秒）"),
    changeS: z.number().min(0.2).default(1.6),
    number: z.object({ from: z.number().optional(), to: z.number().optional(), decimals: z.number().int().min(0).max(2).default(0), prefix: z.string().default(""), suffix: z.string().default("%") }).optional(),
    label: z.string().optional().describe("大数字下方的一行说明"),
    source: z.string().optional().describe("角落里的小字出处，如 Rosenberg et al. 1965"),
    base: z.string().default("inkMuted"),
    highlight: z.string().default("positive"),
    side: z.enum(["right", "none"]).default("right"),
  }),
  examples: [
    { name: "生存率", duration: 5, params: { total: 100, from: 0.1, to: 0.95, label: "survive with treatment", source: "illustrative numbers" } },
  ],
  timeline(p, { t, W, H, d }) {
    const els: El[] = [];
    const ax0 = d.safe.x0, ax1 = p.side === "right" ? W * 0.6 : d.safe.x1;
    const ay0 = d.safe.y0 + H * 0.04, ay1 = d.safe.y1 - H * 0.04;
    const aw = ax1 - ax0, ah = ay1 - ay0;
    const cols = p.cols ?? Math.max(2, Math.round(Math.sqrt((p.total * aw) / (ah * 0.55))));
    const rows = Math.ceil(p.total / cols);
    const slotW = aw / cols;
    const slotH = Math.min(ah / rows, slotW * 2);
    const fh = slotH * 0.86, fw = Math.min(fh * 0.5, slotW * 0.86);
    const gx0 = ax0;
    const gy0 = ay0 + (ah - rows * slotH) / 2;
    const ease = (tt: number) => progress(tt, p.at, p.changeS, d.motion.ease.inOut);
    const frac = lerp(p.from, p.to, ease(t));
    const k = Math.round(frac * p.total);
    // 第 i 个小人变色的时刻（frac 单调，二分求解），用于变色时的小弹跳
    const switchAt = (i: number) => {
      const target = (i + 0.5) / p.total;
      if ((p.to - p.from) === 0 || target < Math.min(p.from, p.to) || target > Math.max(p.from, p.to)) return -1;
      let lo = p.at, hi = p.at + p.changeS;
      for (let n = 0; n < 24; n++) { const m = (lo + hi) / 2; const f = lerp(p.from, p.to, ease(m)); if ((f < target) === (p.to > p.from)) lo = m; else hi = m; }
      return (lo + hi) / 2;
    };
    for (let i = 0; i < p.total; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const cx = gx0 + (c + 0.5) * slotW;
      const cy = gy0 + (r + 0.5) * slotH;
      const at = 0.05 + (r / Math.max(1, rows)) * 0.45 + (c / cols) * 0.12;
      const pp = pop(d, t, at, 0.2);
      const on = i < k;
      const sw = switchAt(i);
      const bump = sw >= 0 ? pulse(t, sw, 0.3) * 0.25 : 0;
      els.push({
        type: "figure", id: `f${i}`, role: "decor", x: cx - fw / 2, y: cy - fh / 2, w: fw, h: fh,
        fill: d.color(on ? p.highlight : p.base), opacity: pp.opacity * (on ? 1 : 0.55), scale: pp.scale * (1 + bump),
        glow: on ? d.glow * 0.5 : 0, z: 1,
      });
    }
    if (p.side === "right") {
      const nf = p.number?.from ?? p.from * 100, nt = p.number?.to ?? p.to * 100;
      const val = lerp(nf, nt, ease(t));
      const str = `${p.number?.prefix ?? ""}${fmtNumber(val, p.number?.decimals ?? 0)}${p.number?.suffix ?? "%"}`;
      const cx = (W * 0.6 + d.safe.x1) / 2;
      const num = text(d, { id: "number", text: str, kind: "number", cx, cy: H * 0.45, color: p.highlight, role: "number", maxW: d.safe.x1 - W * 0.62 });
      const np = pop(d, t, 0.35, 0.7);
      els.push({ ...num, opacity: np.opacity, scale: np.scale, glow: d.glow * clamp(ease(t) * 1.2), z: 3 });
      if (p.label) {
        const l = text(d, { id: "label", text: p.label, kind: "body", cx, cy: num.y + num.h + H * 0.04, maxW: d.safe.x1 - W * 0.62, role: "label" });
        const e = enter(d, t, 0.6, H);
        els.push({ ...shift(l, e.dy), opacity: e.opacity, z: 3 });
      }
    }
    if (p.source) {
      const s = text(d, { id: "source", text: p.source, kind: "kicker", cx: d.safe.x1, cy: d.safe.y1 - d.type.kicker * 0.75, align: "right", color: "inkMuted", weight: 500, role: "caption" });
      els.push({ ...s, opacity: progress(t, 1.0, 0.5) * 0.9, z: 3 });
    }
    return { bg: { linear: [d.palette.bg, d.palette.bgDeep], angle: 160 }, els, vignette: d.texture.vignette, grain: d.texture.grain };
  },
});
