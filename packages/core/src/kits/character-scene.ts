import { z } from "zod";
import { defineKit } from "../kit.ts";
import { line, pop, text, tint } from "../draw.ts";
import { blink, breathe, hashSeed, keyframes, progress, seeded } from "../motion.ts";
import type { Camera, El, Expression } from "../types.ts";

const Expr = z.enum(["neutral", "happy", "sad", "surprised", "worried"]);

export const characterScene = defineKit({
  id: "kit/character-scene",
  title: "角色场景",
  summary: "插画场景（远景 / 近景视差）+ 参数化角色（呼吸、眨眼、表情切换）+ 道具 + 指向标签 + 虚拟相机推拉摇移。讲故事、讲人。",
  tags: { shot_type: ["character", "scene"], metaphor: ["none", "zoom-detail"] },
  duration: [2.5, 9],
  schema: z.object({
    backdrop: z.enum(["hills", "room", "space", "none"]).default("hills"),
    sky: z.string().optional().describe("天空颜色 token（hills / none 背景的上半部），默认用底色"),
    characters: z.array(z.object({
      id: z.string(),
      x: z.number().min(0).max(1).default(0.5).describe("世界坐标水平位置 0–1"),
      size: z.enum(["sm", "md", "lg"]).default("md"),
      body: z.string().default("accent"),
      belly: z.string().optional(),
      expression: Expr.default("neutral"),
      expressions: z.array(z.object({ at: z.number(), expression: Expr })).default([]),
      look: z.number().min(-1).max(1).default(0),
    })).max(4).default([]),
    props: z.array(z.object({
      kind: z.enum(["sun", "moon", "cloud", "tree", "bed", "screen", "capsule"]),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      size: z.number().min(0.03).max(0.5).default(0.12).describe("占画面高度比例"),
      color: z.string().optional(),
    })).default([]),
    label: z.object({ text: z.string(), target: z.string(), at: z.number().default(0.8) }).optional(),
    camera: z.array(z.object({ at: z.number(), x: z.number(), y: z.number(), zoom: z.number().positive() }))
      .default([{ at: 0, x: 0.5, y: 0.5, zoom: 1 }]).describe("关键帧；x/y 为相机对准的世界坐标 0–1"),
  }),
  examples: [
    {
      name: "主角登场 + 推镜", duration: 5,
      params: {
        backdrop: "hills",
        characters: [{ id: "me", x: 0.42, expression: "neutral", expressions: [{ at: 2.6, expression: "worried" }], look: 0.3 }],
        props: [{ kind: "sun", x: 0.8, y: 0.22, size: 0.16 }, { kind: "cloud", x: 0.25, y: 0.2, size: 0.1 }, { kind: "tree", x: 0.7, y: 0.62, size: 0.3 }],
        label: { text: "me, age 23", target: "me", at: 1.0 },
        camera: [{ at: 0, x: 0.5, y: 0.5, zoom: 1 }, { at: 4.5, x: 0.45, y: 0.55, zoom: 1.35 }],
      },
    },
  ],
  timeline(p, { t, W, H, d, seed }) {
    const els: El[] = [];
    const cam = keyframes(t, p.camera.map((k) => ({ at: k.at, x: k.x * W, y: k.y * H, zoom: k.zoom })), d.motion.ease.inOut) as Camera;
    const groundY = H * 0.8;
    // 视差：远景层随相机移动得更少
    const par = (f: number) => ({ dx: (cam.x - W / 2) * (1 - f), dy: (cam.y - H / 2) * (1 - f) });
    let bg: any = { linear: [p.sky ? d.color(p.sky) : d.palette.bg, d.palette.bgDeep], angle: 180 };
    const rnd = seeded(seed);
    if (p.backdrop === "hills") {
      const far = par(0.45), near = par(0.75);
      const hill = (id: string, y: number, amp: number, color: string, o: { dx: number; dy: number }, ph: number) => {
        const x0 = -W * 0.5, x1 = W * 1.5;
        let dd = `M 0 ${H * 1.2 - y}`;
        for (let i = 0; i <= 24; i++) {
          const x = (i / 24) * (x1 - x0);
          dd += ` L ${x} ${amp * Math.sin(i * 0.55 + ph) + amp * 0.5 * Math.sin(i * 1.3 + ph * 2)}`;
        }
        dd += ` L ${x1 - x0} ${H * 1.2 - y} Z`;
        els.push({ type: "path", id, role: "decor", x: x0 + o.dx, y: y + o.dy, w: x1 - x0, h: H * 1.2 - y, d: dd, fill: color, z: 0 });
      };
      hill("hill-far", H * 0.6, H * 0.03, tint(d, "accent2", "bg", 0.7), far, rnd() * 6);
      hill("hill-near", H * 0.7, H * 0.025, tint(d, "positive", "bg", 0.55), near, rnd() * 6);
      els.push({ type: "rect", id: "ground", role: "decor", x: -W, y: groundY, w: W * 3, h: H, fill: tint(d, "positive", "bgDeep", 0.4), z: 0 });
    } else if (p.backdrop === "room") {
      els.push({ type: "rect", id: "wall", role: "decor", x: -W, y: -H, w: W * 3, h: groundY + H, fill: d.palette.surface, z: 0 });
      els.push({ type: "rect", id: "floor", role: "decor", x: -W, y: groundY, w: W * 3, h: H, fill: d.palette.bgDeep, z: 0 });
      els.push({ type: "rect", id: "window", role: "decor", x: W * 0.12, y: H * 0.16, w: W * 0.16, h: H * 0.3, radius: H * 0.02, fill: { linear: [tint(d, "accent2", "surface", 0.5), tint(d, "glow", "surface", 0.4)], angle: 180 }, z: 0 });
    } else if (p.backdrop === "space") {
      bg = { radial: [d.palette.surface, d.palette.bgDeep] };
      for (let i = 0; i < 60; i++) {
        const o = par(0.3 + 0.4 * rnd());
        const r = H * (0.002 + 0.004 * rnd());
        const tw = 0.5 + 0.5 * breathe(t, 0.3 + rnd() * 0.5, rnd());
        els.push({ type: "ellipse", id: `star${i}`, role: "decor", x: -W * 0.3 + rnd() * W * 1.6 + o.dx, y: -H * 0.3 + rnd() * H * 1.6 + o.dy, w: 2 * r, h: 2 * r, fill: d.palette.glow, opacity: 0.4 + 0.6 * tw, glow: d.glow, z: 0 });
      }
    }
    p.props.forEach((pr, i) => {
      const s = pr.size * H, cx = pr.x * W, cy = pr.y * H;
      const col = pr.color ? d.color(pr.color) : undefined;
      const id = `prop${i}:${pr.kind}`;
      const sky = pr.kind === "sun" || pr.kind === "moon" || pr.kind === "cloud";
      const o = sky ? par(0.3) : { dx: 0, dy: 0 };
      const bob = sky ? breathe(t, 0.12, i * 0.3) * H * 0.006 : 0;
      if (pr.kind === "sun" || pr.kind === "moon") {
        els.push({ type: "ellipse", id, role: "decor", x: cx - s / 2 + o.dx, y: cy - s / 2 + o.dy + bob, w: s, h: s, fill: { radial: [col ?? d.palette.glow, tint(d, "glow", "accent", pr.kind === "sun" ? 0.25 : 0)] }, glow: d.glow, z: 0 });
      } else if (pr.kind === "cloud") {
        [[-0.35, 0.1, 0.5], [0, -0.05, 0.65], [0.35, 0.1, 0.5]].forEach(([dx, dy, r], k) =>
          els.push({ type: "ellipse", id: `${id}:${k}`, role: "decor", x: cx + dx * s * 1.6 - r * s + o.dx, y: cy + dy * s - r * s + o.dy + bob, w: 2 * r * s, h: 2 * r * s * 0.8, fill: col ?? d.palette.surface, opacity: 0.95, z: 0 }));
      } else if (pr.kind === "tree") {
        els.push({ type: "rect", id: `${id}:trunk`, role: "decor", x: cx - s * 0.06, y: cy, w: s * 0.12, h: groundY - cy, radius: s * 0.04, fill: tint(d, "negative", "ink", 0.55), z: 1 });
        els.push({ type: "ellipse", id: `${id}:crown`, role: "decor", x: cx - s * 0.4, y: cy - s * 0.55, w: s * 0.8, h: s * 0.8, fill: col ?? tint(d, "positive", "ink", 0.15), z: 1, scale: 1 + 0.015 * breathe(t, 0.25, i) });
      } else if (pr.kind === "bed") {
        els.push({ type: "rect", id: `${id}:frame`, role: "decor", x: cx - s, y: groundY - s * 0.35, w: s * 2, h: s * 0.35, radius: s * 0.06, fill: col ?? d.palette.accent2, z: 1 });
        els.push({ type: "rect", id: `${id}:sheet`, role: "decor", x: cx - s * 0.95, y: groundY - s * 0.48, w: s * 1.9, h: s * 0.18, radius: s * 0.08, fill: d.palette.surface, z: 1 });
      } else if (pr.kind === "screen") {
        els.push({ type: "rect", id: `${id}:body`, role: "decor", x: cx - s * 0.7, y: cy - s * 0.45, w: s * 1.4, h: s * 0.9, radius: s * 0.06, fill: d.palette.ink, z: 1 });
        els.push({ type: "rect", id: `${id}:glass`, role: "decor", x: cx - s * 0.62, y: cy - s * 0.38, w: s * 1.24, h: s * 0.76, radius: s * 0.04, fill: { linear: [col ?? d.palette.accent2, d.palette.glow], angle: 135 }, glow: d.glow * 0.6, z: 1 });
      } else if (pr.kind === "capsule") {
        els.push({ type: "rect", id, role: "decor", x: cx - s * 0.5, y: cy - s * 0.2, w: s, h: s * 0.4, radius: s * 0.2, fill: { linear: [col ?? d.palette.positive, d.palette.surface], angle: 90 }, glow: d.glow, z: 1, rotate: -20 });
      }
    });
    const SZ = { sm: 0.22, md: 0.32, lg: 0.44 } as const;
    const pos = new Map<string, { cx: number; top: number; h: number }>();
    p.characters.forEach((c, i) => {
      const h = SZ[c.size] * H, w = h * 0.78;
      const cx = c.x * W;
      const cs = hashSeed(c.id) ^ seed;
      let ex: Expression = c.expression;
      for (const k of c.expressions) if (t >= k.at) ex = k.expression;
      const pp = pop(d, t, 0.1 + i * 0.15, 0.8);
      els.push({
        type: "character", id: `char:${c.id}`, role: "character", x: cx - w / 2, y: groundY - h, w, h,
        body: d.color(c.body), belly: c.belly ? d.color(c.belly) : tint(d, c.body, "surface", 0.55),
        expression: ex, blink: blink(t, d.motion.blinkEveryS, cs), breathe: breathe(t, d.motion.breatheHz, (cs % 1000) / 1000), look: c.look,
        opacity: pp.opacity, scale: pp.scale, z: 2,
      });
      els.push({ type: "ellipse", id: `shadow:${c.id}`, role: "decor", x: cx - w * 0.45, y: groundY - H * 0.012, w: w * 0.9, h: H * 0.025, fill: tint(d, "ink", "bgDeep", 0.75), opacity: 0.5 * pp.opacity, z: 1 });
      pos.set(c.id, { cx, top: groundY - h, h });
    });
    if (p.label) {
      const tg = pos.get(p.label.target);
      if (!tg) throw new Error(`label.target "${p.label.target}" 不是已有角色`);
      const lx = tg.cx + tg.h * 0.55, ly = tg.top - H * 0.06;
      const lb = text(d, { id: "label", text: p.label.text, kind: "label", cx: lx, cy: ly, align: "left", color: "ink", role: "label", layer: "world", weight: 700 });
      const pp = pop(d, t, p.label.at, 0.7);
      els.push({ ...line("leader", tg.cx + tg.h * 0.18, tg.top + tg.h * 0.12, lx - H * 0.012, ly + lb.h * 0.25, { stroke: d.palette.ink, strokeW: H * 0.004 }), progress: progress(t, p.label.at, 0.35), z: 3 });
      els.push({ ...lb, opacity: pp.opacity, scale: pp.scale, z: 3 });
    }
    return { bg, camera: cam, els, vignette: d.texture.vignette, grain: d.texture.grain };
  },
});
