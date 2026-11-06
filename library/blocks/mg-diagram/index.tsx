// 积木：黑底极简图解。对应参考集 diagram 段（竖屏 40%）：节点 + 连线 + 分步揭示 + 流动粒子。
// 隐喻：flow-path（流动粒子）、contrast-split（左右节点对照）、cause-effect-arrow（箭头）。
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { useEnter, useFontPx, usePop, useProgress, useSegment, useStagger, useTheme } from "../../_sdk";
import type { Params } from "./schema";

const SIZE = { sm: 0.06, md: 0.09, lg: 0.13 } as const;

type Node = Params["nodes"][number];
type Edge = Params["edges"][number];

/** 节点几何：估算方框 / 胶囊半宽高，并把中心收进内容区（规范 H4：不出画）。NodeView 与 EdgeView 共用。 */
function geom(n: Node, box: { w: number; h: number }, bodyPx: number, labelPx: number) {
  const m = Math.min(box.w, box.h);
  let hw: number, hh: number;
  if (n.shape === "circle") {
    hw = hh = SIZE[n.size] * m;
  } else {
    const fp = n.size === "lg" ? bodyPx * 1.3 : n.size === "sm" ? labelPx : bodyPx;
    const chars = [...(n.label ?? n.glyph ?? n.id)].reduce((k, c) => k + (/[\x00-\xff]/.test(c) ? 0.6 : 1), 0);
    hw = (chars * fp + fp * 1.6) / 2;
    hh = fp * 0.85;
  }
  const margin = m * 0.03;
  const cx = Math.min(Math.max(n.x * box.w, hw + margin), box.w - hw - margin);
  const cy = Math.min(Math.max(n.y * box.h, hh + margin), box.h - hh - margin);
  return { cx, cy, hw, hh };
}

function appearTimes(p: Params, stagger: (i: number) => number): Map<string, number> {
  const m = new Map<string, number>();
  if (p.steps.length === 0) {
    p.nodes.forEach((n, i) => m.set(n.id, stagger(i)));
    p.edges.forEach((e, i) => m.set(`${e.from}>${e.to}`, stagger(p.nodes.length + i)));
    return m;
  }
  for (const s of p.steps) for (const id of s.show) if (!m.has(id)) m.set(id, s.at);
  // 未在 steps 中出现的边：两端节点都出现后出现
  for (const e of p.edges) {
    const id = `${e.from}>${e.to}`;
    if (!m.has(id)) m.set(id, Math.max(m.get(e.from) ?? 0, m.get(e.to) ?? 0) + 0.2);
  }
  return m;
}

const NodeView: React.FC<{ n: Node; at: number; emph: number[]; box: { w: number; h: number } }> = ({ n, at, emph, box }) => {
  const { style } = useTheme();
  const col = style.color[n.color];
  const r = SIZE[n.size] * Math.min(box.w, box.h);
  const enter = useEnter({ delayS: at, mode: "pop" });
  const labelPx = useFontPx("label");
  const bodyPx = useFontPx("body");
  const { cx, cy } = geom(n, box, bodyPx, labelPx);
  const common: React.CSSProperties = { position: "absolute", left: cx, top: cy, ...enter };
  const rectRadius = n.shape === "pill" ? bodyPx * 2 : bodyPx * 0.3;
  const pulses = emph.map((t, i) =>
    n.shape === "circle" ? <Pulse key={i} at={t} r={r} color={col} /> : <Pulse key={i} at={t} color={col} radius={rectRadius} />,
  );
  if (n.shape === "circle") {
    return (
      <div style={{ ...common, transform: `translate(-50%, -50%) ${enter.transform ?? ""}` }}>
        <div style={{ position: "relative", width: r * 2, height: r * 2 }}>
          {pulses}
          <div
            style={{
              width: r * 2,
              height: r * 2,
              borderRadius: "50%",
              border: `${Math.max(3, r * 0.08)}px solid ${col}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: col,
              fontFamily: style.font.display,
              fontWeight: 800,
              fontSize: r * 0.9,
              boxShadow: `0 0 ${r * 0.6}px ${col}55`,
            }}
          >
            {n.glyph ?? ""}
          </div>
        </div>
        {n.label ? (
          <div style={{ position: "absolute", top: r * 2 + labelPx * 0.4, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap", color: style.color.fgMuted, fontSize: labelPx, fontWeight: 700 }}>
            {n.label}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div style={{ ...common, transform: `translate(-50%, -50%) ${enter.transform ?? ""}` }}>
      <div style={{ position: "relative" }}>
        {pulses}
        <div
          style={{
            padding: `${bodyPx * 0.35}px ${bodyPx * 0.8}px`,
            borderRadius: n.shape === "pill" ? bodyPx * 2 : bodyPx * 0.3,
            border: `3px solid ${col}`,
            background: n.shape === "box" ? `${col}22` : "transparent",
            color: col,
            fontSize: n.size === "lg" ? bodyPx * 1.3 : n.size === "sm" ? labelPx : bodyPx,
            fontWeight: 800,
            whiteSpace: "nowrap",
          }}
        >
          {n.label ?? n.glyph ?? n.id}
        </div>
      </div>
    </div>
  );
};

/** 强调光环：与节点同形状向外扩散。circle 传半径；方框 / 胶囊用 inset 扩散。 */
const Pulse: React.FC<{ at: number; r?: number; color: string; radius?: number }> = ({ at, r, color, radius }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (frame - at * fps) / fps;
  if (t < 0 || t > 0.9) return null;
  const k = t / 0.9;
  if (r === undefined) {
    const grow = 6 + k * 40;
    return <div style={{ position: "absolute", inset: -grow, borderRadius: (radius ?? 0) + grow, border: `4px solid ${color}`, opacity: 1 - k }} />;
  }
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: r * 2 * (1 + k * 0.8),
        height: r * 2 * (1 + k * 0.8),
        transform: "translate(-50%, -50%)",
        borderRadius: "50%",
        border: `4px solid ${color}`,
        opacity: 1 - k,
      }}
    />
  );
};

const EdgeView: React.FC<{ e: Edge; a: Node; b: Node; at: number; box: { w: number; h: number } }> = ({ e, a, b, at, box }) => {
  const { style } = useTheme();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = useProgress(at);
  const labelPx = useFontPx("label");
  const col = style.color[e.color];
  const m = Math.min(box.w, box.h);
  const bodyPx = useFontPx("body");
  const ga = geom(a, box, bodyPx, labelPx), gb = geom(b, box, bodyPx, labelPx);
  const ax = ga.cx, ay = ga.cy, bx = gb.cx, by = gb.cy;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  // 端点：圆形按半径，方框 / 胶囊按矩形边界求交，避免箭头压到文字（规范 H5）
  const reach = (n: Node, g: { hw: number; hh: number }, dirx: number, diry: number) => {
    if (n.shape === "circle") return g.hw;
    return Math.min(Math.abs(dirx) > 1e-6 ? g.hw / Math.abs(dirx) : Infinity, Math.abs(diry) > 1e-6 ? g.hh / Math.abs(diry) : Infinity);
  };
  const gapPx = Math.max(8, m * 0.015);
  const ra = reach(a, ga, ux, uy) + gapPx;
  const rb = reach(b, gb, ux, uy) + gapPx * 1.4;
  const x1 = ax + ux * ra, y1 = ay + uy * ra;
  const x2 = bx - ux * rb, y2 = by - uy * rb;
  // 标签放在连线法线方向（偏上 / 偏右），不压线
  let nx = -uy, ny = ux;
  if (ny > 0 || (Math.abs(ny) < 1e-6 && nx < 0)) { nx = -nx; ny = -ny; }
  const off = labelPx * 1.1;
  const L = Math.hypot(x2 - x1, y2 - y1);
  const sw = Math.max(3, m * 0.008);
  const head = sw * 4;
  const visible = frame >= at * fps;
  const dots = [];
  if (e.style === "flow" && p >= 1) {
    const n = Math.max(3, Math.round(L / (m * 0.08)));
    const speed = 0.6; // 每秒走过线长的比例
    const t = (frame / fps - at) * speed;
    for (let i = 0; i < n; i++) {
      const k = (i / n + t) % 1;
      dots.push(<circle key={i} cx={x1 + (x2 - x1) * k} cy={y1 + (y2 - y1) * k} r={sw * 1.6} fill={style.color.accent} opacity={Math.sin(k * Math.PI)} />);
    }
  }
  return (
    <>
      <svg style={{ position: "absolute", inset: 0, overflow: "visible", opacity: visible ? 1 : 0 }} width={box.w} height={box.h}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeWidth={sw} strokeLinecap="round" strokeDasharray={L} strokeDashoffset={L * (1 - p)} />
        {e.style !== "line" && p > 0.95 ? (
          <polygon
            points={`${x2},${y2} ${x2 - ux * head - uy * head * 0.6},${y2 - uy * head + ux * head * 0.6} ${x2 - ux * head + uy * head * 0.6},${y2 - uy * head - ux * head * 0.6}`}
            fill={col}
          />
        ) : null}
        {dots}
      </svg>
      {e.label ? (
        <div
          style={{
            position: "absolute",
            left: (x1 + x2) / 2 + nx * off,
            top: (y1 + y2) / 2 + ny * off,
            transform: `translate(${Math.abs(nx) > 0.7 ? (nx > 0 ? "0%" : "-100%") : "-50%"}, -50%)`,
            color: style.color.fgMuted,
            fontSize: labelPx,
            fontWeight: 700,
            whiteSpace: "nowrap",
            opacity: p,
          }}
        >
          {e.label}
        </div>
      ) : null}
    </>
  );
};

export const MgDiagram: React.FC<Params> = (p) => {
  const { box } = useSegment();
  const { style } = useTheme();
  const stagger = useStagger();
  const titlePx = useFontPx("title");
  const titleStyle = useEnter({ delayS: 0, from: "top", mode: "slide" });
  const at = appearTimes(p, stagger);
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const emphOf = (id: string) => p.steps.filter((s) => s.emphasize.includes(id)).map((s) => s.at);
  return (
    <AbsoluteFill style={{ background: style.color.panel }}>
      {p.title ? (
        <div style={{ position: "absolute", top: box.h * 0.06, width: "100%", textAlign: "center", color: style.color.fg, fontSize: titlePx, fontWeight: 900, ...titleStyle }}>
          {p.title}
        </div>
      ) : null}
      {p.edges.map((e, i) => {
        const a = byId.get(e.from), b = byId.get(e.to);
        if (!a || !b) return null;
        return <EdgeView key={i} e={e} a={a} b={b} at={at.get(`${e.from}>${e.to}`) ?? 0} box={box} />;
      })}
      {p.nodes.map((n) => (
        <NodeView key={n.id} n={n} at={at.get(n.id) ?? 0} emph={emphOf(n.id)} box={box} />
      ))}
    </AbsoluteFill>
  );
};

export default MgDiagram;
