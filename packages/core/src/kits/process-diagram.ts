import { z } from "zod";
import { contrast } from "../color.ts";
import { defineKit } from "../kit.ts";
import { enter, line, pop, pulse, shift, text } from "../draw.ts";
import { progress } from "../motion.ts";
import type { El } from "../types.ts";

const Node = z.object({
  id: z.string(),
  label: z.string().optional(),
  glyph: z.string().optional().describe("节点内的符号 / 短词，如 + − DNA"),
  shape: z.enum(["circle", "pill", "box"]).default("circle"),
  x: z.number().min(0).max(1).describe("内容区内水平位置 0–1"),
  y: z.number().min(0).max(1).describe("内容区内垂直位置 0–1"),
  size: z.enum(["sm", "md", "lg"]).default("md"),
  color: z.string().default("accent2"),
});
const Edge = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
  style: z.enum(["line", "arrow", "flow"]).default("arrow").describe("flow：沿线流动的粒子，表示物质 / 能量 / 信号在流动"),
  color: z.string().default("inkMuted"),
});

export const processDiagram = defineKit({
  id: "kit/process-diagram",
  title: "过程图解",
  summary: "节点 + 连线 + 分步揭示；连线可为箭头或流动粒子，节点可在指定时刻脉冲强调。讲因果、流程、物质流动。",
  tags: { shot_type: ["diagram", "process-flow"], metaphor: ["flow-path", "cause-effect-arrow", "contrast-split"] },
  duration: [2, 8],
  schema: z.object({
    title: z.string().optional(),
    nodes: z.array(Node).min(1).max(12),
    edges: z.array(Edge).default([]),
    steps: z.array(z.object({
      at: z.number().min(0).describe("镜头内秒数"),
      show: z.array(z.string()).default([]).describe("此时出现的节点 / 边（边 id 为 from>to）"),
      emphasize: z.array(z.string()).default([]).describe("此时脉冲强调的节点"),
    })).default([]).describe("为空时节点依次入场，连线在两端都出现后描出"),
  }),
  examples: [
    {
      name: "药物进入细胞", duration: 4.5,
      params: {
        title: "How it gets in",
        nodes: [
          { id: "blood", glyph: "≈", label: "bloodstream", x: 0.15, y: 0.5, size: "lg", color: "accent2" },
          { id: "cell", glyph: "◎", label: "cell", x: 0.55, y: 0.5, size: "lg", color: "accent" },
          { id: "dna", glyph: "DNA", label: "nucleus", x: 0.88, y: 0.5, size: "md", color: "positive" },
        ],
        edges: [{ from: "blood", to: "cell", style: "flow", color: "positive" }, { from: "cell", to: "dna", style: "arrow" }],
        steps: [{ at: 0.2, show: ["blood"] }, { at: 0.8, show: ["cell", "blood>cell"] }, { at: 2.0, show: ["dna", "cell>dna"] }, { at: 3.0, emphasize: ["dna"] }],
      },
    },
  ],
  timeline(p, { t, W, H, d }) {
    const els: El[] = [];
    const top = d.safe.y0 + (p.title ? H * 0.1 : 0);
    const area = { x0: d.safe.x0 + W * 0.04, x1: d.safe.x1 - W * 0.04, y0: top + H * 0.06, y1: d.safe.y1 - H * 0.1 };
    const R = { sm: 0.05, md: 0.07, lg: 0.095 } as const;
    // 出现时刻
    const appear = new Map<string, number>();
    const emph: Array<{ id: string; at: number }> = [];
    if (p.steps.length) {
      for (const s of p.steps) {
        for (const id of s.show) if (!appear.has(id)) appear.set(id, s.at);
        for (const id of s.emphasize) emph.push({ id, at: s.at });
      }
      for (const n of p.nodes) if (!appear.has(n.id)) appear.set(n.id, 0);
    } else {
      p.nodes.forEach((n, i) => appear.set(n.id, 0.2 + i * 0.35));
    }
    const geo = new Map<string, { cx: number; cy: number; hw: number; hh: number; shape: string }>();
    for (const n of p.nodes) {
      const r = R[n.size] * H;
      const [hw, hh] = n.shape === "circle" ? [r, r] : n.shape === "pill" ? [r * 1.25, r * 0.65] : [r * 1.3, r * 0.8];
      const cx = Math.min(area.x1 - hw, Math.max(area.x0 + hw, area.x0 + n.x * (area.x1 - area.x0)));
      const cy = Math.min(area.y1 - hh, Math.max(area.y0 + hh, area.y0 + n.y * (area.y1 - area.y0)));
      geo.set(n.id, { cx, cy, hw, hh, shape: n.shape });
    }
    // 从中心朝 (dx,dy) 方向与节点边界的交点
    const edgePoint = (g: { cx: number; cy: number; hw: number; hh: number; shape: string }, dx: number, dy: number, gap: number) => {
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      let s: number;
      if (g.shape === "circle") s = g.hw;
      else s = Math.min(Math.abs(ux) > 1e-6 ? g.hw / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? g.hh / Math.abs(uy) : Infinity);
      return { x: g.cx + ux * (s + gap), y: g.cy + uy * (s + gap) };
    };
    for (const e of p.edges) {
      const a = geo.get(e.from), b = geo.get(e.to);
      if (!a || !b) throw new Error(`连线 ${e.from}>${e.to} 引用了不存在的节点`);
      const id = `${e.from}>${e.to}`;
      const at = appear.get(id) ?? Math.max(appear.get(e.from) ?? 0, appear.get(e.to) ?? 0) + 0.15;
      const p0 = edgePoint(a, b.cx - a.cx, b.cy - a.cy, H * 0.012);
      const p1 = edgePoint(b, a.cx - b.cx, a.cy - b.cy, H * (e.style === "arrow" ? 0.022 : 0.012));
      const prog = progress(t, at, 0.5, d.motion.ease.out);
      const col = d.color(e.color);
      const sw = H * 0.006;
      els.push({ ...line(`edge:${id}`, p0.x, p0.y, p1.x, p1.y, { stroke: col, strokeW: sw }), progress: prog, opacity: e.style === "flow" ? 0.45 : 1, z: 1 });
      const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
      if (e.style === "arrow" && prog > 0.98) {
        const s = H * 0.022;
        const tip = { x: p1.x + Math.cos(ang) * s * 0.6, y: p1.y + Math.sin(ang) * s * 0.6 };
        const l = { x: tip.x - Math.cos(ang - 0.5) * s, y: tip.y - Math.sin(ang - 0.5) * s };
        const r = { x: tip.x - Math.cos(ang + 0.5) * s, y: tip.y - Math.sin(ang + 0.5) * s };
        const bx = Math.min(tip.x, l.x, r.x), by = Math.min(tip.y, l.y, r.y);
        els.push({ type: "path", id: `head:${id}`, role: "decor", x: bx, y: by, w: Math.max(tip.x, l.x, r.x) - bx, h: Math.max(tip.y, l.y, r.y) - by,
          d: `M ${tip.x - bx} ${tip.y - by} L ${l.x - bx} ${l.y - by} L ${r.x - bx} ${r.y - by} Z`, fill: col, z: 1 });
      }
      if (e.style === "flow" && prog > 0.3) {
        const L = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        const gap = H * 0.05, n = Math.max(2, Math.floor(L / gap)), rr = H * 0.009;
        for (let i = 0; i < n; i++) {
          const u = ((i / n + (t - at) * 0.35) % 1 + 1) % 1;
          if (u > prog) continue;
          const x = p0.x + (p1.x - p0.x) * u, y = p0.y + (p1.y - p0.y) * u;
          els.push({ type: "ellipse", id: `dot:${id}:${i}`, role: "decor", x: x - rr, y: y - rr, w: 2 * rr, h: 2 * rr, fill: col, glow: d.glow, z: 2,
            opacity: Math.min(1, u * 6, (1 - u) * 6) });
        }
      }
      if (e.label) {
        const nx = -Math.sin(ang), ny = Math.cos(ang);
        const mx = (p0.x + p1.x) / 2 - nx * H * 0.04, my = (p0.y + p1.y) / 2 - ny * H * 0.04;
        const lb = text(d, { id: `label:${id}`, text: e.label, kind: "label", cx: mx, cy: my, color: "inkMuted", role: "label" });
        els.push({ ...lb, opacity: progress(t, at + 0.3, 0.3), z: 3 });
      }
    }
    for (const n of p.nodes) {
      const g = geo.get(n.id)!;
      const at = appear.get(n.id)!;
      const pp = pop(d, t, at, 0.3);
      const fill = d.color(n.color);
      const em = emph.filter((x) => x.id === n.id).reduce((m, x) => Math.max(m, pulse(t, x.at, 0.6)), 0);
      const base = { id: `node:${n.id}`, role: "focal" as const, x: g.cx - g.hw, y: g.cy - g.hh, w: 2 * g.hw, h: 2 * g.hh, opacity: pp.opacity, scale: pp.scale * (1 + 0.12 * em), glow: d.glow * (0.4 + em), z: 2 };
      els.push(n.shape === "circle"
        ? { type: "ellipse", ...base, fill: { radial: [fill, fill] } }
        : { type: "rect", ...base, fill, radius: n.shape === "pill" ? g.hh : g.hh * 0.35 });
      for (const x of emph.filter((x) => x.id === n.id)) {
        const k = (t - x.at) / 0.7;
        if (k < 0 || k > 1) continue;
        const s = 1 + 0.7 * k;
        els.push({ type: "ellipse", id: `ring:${n.id}:${x.at}`, role: "decor", x: g.cx - g.hw * s, y: g.cy - g.hh * s, w: 2 * g.hw * s, h: 2 * g.hh * s,
          fill: "none", stroke: fill, strokeW: H * 0.006, opacity: 1 - k, z: 1 });
      }
      if (n.glyph) {
        const gc = contrast(d.palette.ink, fill) >= contrast(d.palette.surface, fill) ? "ink" : "surface";
        const gl = text(d, { id: `glyph:${n.id}`, text: n.glyph, kind: "body", cx: g.cx, cy: g.cy, color: gc, font: "display", weight: 700, maxW: g.hw * 1.6, on: fill, role: "label", scaleSize: 1.4 });
        els.push({ ...gl, opacity: pp.opacity, scale: pp.scale, z: 3 });
      }
      if (n.label) {
        const lb = text(d, { id: `label:${n.id}`, text: n.label, kind: "label", cx: g.cx, cy: g.cy + g.hh + H * 0.04, color: "ink", role: "label", on: d.palette.bg });
        const e = enter(d, t, at + 0.15, H, 0.015);
        els.push({ ...shift(lb, e.dy), opacity: e.opacity, z: 3 });
      }
    }
    if (p.title) {
      const tt = text(d, { id: "title", text: p.title, kind: "body", cx: W / 2, cy: d.safe.y0 + H * 0.05, weight: 700, role: "title", maxW: d.safe.x1 - d.safe.x0 });
      const e = enter(d, t, 0, H);
      els.push({ ...shift(tt, e.dy), opacity: e.opacity, z: 3 });
    }
    return { bg: { linear: [d.palette.bg, d.palette.bgDeep], angle: 180 }, els, vignette: d.texture.vignette, grain: d.texture.grain };
  },
});
