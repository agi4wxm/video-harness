// 场景图 → SVG。所有积木和本地镜头共用这一个渲染器；inspect 读到的框就是这里画的位置。
import React from "react";
import type { CharacterEl, El, Paint, SceneFrame } from "@video-harness/core";

let gid = 0;
function paint(p: Paint | undefined, defs: React.ReactNode[], key: string): string | undefined {
  if (p === undefined) return undefined;
  if (typeof p === "string") return p;
  const id = `g${key}-${gid++}`;
  if ("linear" in p) {
    const a = ((p.angle ?? 180) - 90) * (Math.PI / 180);
    const x = Math.cos(a) / 2, y = Math.sin(a) / 2;
    defs.push(
      <linearGradient key={id} id={id} x1={0.5 - x} y1={0.5 - y} x2={0.5 + x} y2={0.5 + y}>
        <stop offset="0" stopColor={p.linear[0]} />
        <stop offset="1" stopColor={p.linear[1]} />
      </linearGradient>,
    );
  } else {
    defs.push(
      <radialGradient key={id} id={id} cx="0.4" cy="0.35" r="0.75">
        <stop offset="0" stopColor={p.radial[0]} />
        <stop offset="1" stopColor={p.radial[1]} />
      </radialGradient>,
    );
  }
  return `url(#${id})`;
}

function mainColor(el: El): string | undefined {
  switch (el.type) {
    case "text": return el.color;
    case "figure": return el.fill;
    case "character": return el.body;
    case "path": return el.stroke ?? (typeof el.fill === "string" ? el.fill : undefined);
    default: return typeof el.fill === "string" && el.fill !== "none" ? el.fill : el.stroke;
  }
}

function Character({ el }: { el: CharacterEl }) {
  const { w, h } = el;
  const br = 1 + 0.025 * el.breathe;
  const bodyW = w * 0.86 * (1 - 0.01 * el.breathe), bodyH = h * 0.86 * br;
  const cx = w / 2, bottom = h * 0.97, cy = bottom - bodyH / 2;
  const eyeY = cy - bodyH * 0.12, eyeDX = bodyW * 0.17, eyeR = bodyW * 0.11;
  const look = el.look * eyeR * 0.35;
  const open = Math.max(0.08, 1 - el.blink);
  const mouthY = cy + bodyH * 0.1, mw = bodyW * 0.16;
  const mouth = {
    neutral: `M ${cx - mw} ${mouthY} Q ${cx} ${mouthY + mw * 0.25} ${cx + mw} ${mouthY}`,
    happy: `M ${cx - mw} ${mouthY - mw * 0.1} Q ${cx} ${mouthY + mw * 0.9} ${cx + mw} ${mouthY - mw * 0.1}`,
    sad: `M ${cx - mw} ${mouthY + mw * 0.4} Q ${cx} ${mouthY - mw * 0.35} ${cx + mw} ${mouthY + mw * 0.4}`,
    surprised: "",
    worried: `M ${cx - mw} ${mouthY + mw * 0.2} Q ${cx - mw * 0.5} ${mouthY - mw * 0.15} ${cx} ${mouthY + mw * 0.15} Q ${cx + mw * 0.5} ${mouthY + mw * 0.4} ${cx + mw} ${mouthY + mw * 0.05}`,
  }[el.expression];
  const ink = "#24183A";
  const brow = el.expression === "worried" || el.expression === "sad" ? 0.35 : el.expression === "surprised" ? 0 : null;
  const lift = el.expression === "surprised" ? eyeR * 0.45 : 0;
  return (
    <g>
      <ellipse cx={cx - bodyW * 0.42} cy={cy + bodyH * 0.12} rx={bodyW * 0.1} ry={bodyH * 0.16} fill={el.body} />
      <ellipse cx={cx + bodyW * 0.42} cy={cy + bodyH * 0.12} rx={bodyW * 0.1} ry={bodyH * 0.16} fill={el.body} />
      <ellipse cx={cx - bodyW * 0.18} cy={bottom - h * 0.01} rx={bodyW * 0.13} ry={h * 0.035} fill={el.body} />
      <ellipse cx={cx + bodyW * 0.18} cy={bottom - h * 0.01} rx={bodyW * 0.13} ry={h * 0.035} fill={el.body} />
      <ellipse cx={cx} cy={cy} rx={bodyW / 2} ry={bodyH / 2} fill={el.body} />
      <ellipse cx={cx} cy={cy + bodyH * 0.2} rx={bodyW * 0.3} ry={bodyH * 0.22} fill={el.belly ?? el.body} opacity={0.9} />
      {[-1, 1].map((s) => (
        <g key={s}>
          <ellipse cx={cx + s * eyeDX} cy={eyeY} rx={eyeR} ry={eyeR * 1.15 * open} fill="#FFFFFF" />
          {open > 0.3 ? <ellipse cx={cx + s * eyeDX + look} cy={eyeY + eyeR * 0.1} rx={eyeR * 0.55} ry={eyeR * 0.62 * open} fill={ink} /> : null}
          {open > 0.3 ? <ellipse cx={cx + s * eyeDX + look - eyeR * 0.2} cy={eyeY - eyeR * 0.25} rx={eyeR * 0.16} ry={eyeR * 0.16} fill="#FFFFFF" /> : null}
          {brow !== null ? (
            <path d={`M ${cx + s * eyeDX - eyeR} ${eyeY - eyeR * 1.5 - lift + s * brow * eyeR * -0.6} Q ${cx + s * eyeDX} ${eyeY - eyeR * 1.5 - lift - (lift ? eyeR * 0.35 : 0)} ${cx + s * eyeDX + eyeR} ${eyeY - eyeR * 1.5 - lift - s * brow * eyeR * -0.6}`} stroke={ink} strokeWidth={eyeR * 0.25} strokeLinecap="round" />
          ) : null}
        </g>
      ))}
      {el.expression === "surprised" ? (
        <ellipse cx={cx} cy={mouthY + mw * 0.2} rx={mw * 0.45} ry={mw * 0.6} fill={ink} />
      ) : (
        <path d={mouth} stroke={ink} strokeWidth={eyeR * 0.28} strokeLinecap="round" fill="none" />
      )}
    </g>
  );
}

// 注意：直接调用（不作为组件），这样渐变 defs 在返回 SVG 之前就已收集完。
function renderElem(el: El, defs: React.ReactNode[], H: number, k: string): React.ReactNode {
  const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
  const s = el.scale ?? 1, r = el.rotate ?? 0;
  const transform = s !== 1 || r !== 0 ? `translate(${cx} ${cy}) rotate(${r}) scale(${s}) translate(${-cx} ${-cy})` : undefined;
  const gc = el.glowColor ?? mainColor(el);
  const style: React.CSSProperties = el.glow && gc ? { filter: `drop-shadow(0 0 ${(el.glow * 0.035 * H).toFixed(1)}px ${gc})` } : {};
  const op = el.opacity ?? 1;
  if (op <= 0.001) return null;
  let body: React.ReactNode = null;
  switch (el.type) {
    case "text": {
      const n = [...el.text].length;
      const shown = el.reveal === undefined ? el.text : [...el.text].slice(0, Math.round(n * el.reveal)).join("");
      const ax = el.align === "left" ? el.x : el.align === "right" ? el.x + el.w : cx;
      const fam = el.font === "display" ? "'Fredoka', 'Noto Sans SC', sans-serif" : el.font === "mono" ? "'JetBrains Mono', monospace" : "'Inter', 'Noto Sans SC', sans-serif";
      body = (
        <text x={ax} y={cy} dominantBaseline="central" textAnchor={el.align === "left" ? "start" : el.align === "right" ? "end" : "middle"}
          fontFamily={fam} fontSize={el.size} fontWeight={el.weight} fill={el.color}>{shown}</text>
      );
      break;
    }
    case "rect":
      body = <rect x={el.x} y={el.y} width={Math.max(0, el.w)} height={Math.max(0, el.h)} rx={el.radius ?? 0} fill={paint(el.fill, defs, k)} stroke={el.stroke} strokeWidth={el.strokeW} />;
      break;
    case "ellipse":
      body = <ellipse cx={cx} cy={cy} rx={Math.max(0, el.w / 2)} ry={Math.max(0, el.h / 2)} fill={paint(el.fill, defs, k)} stroke={el.stroke} strokeWidth={el.strokeW} />;
      break;
    case "path": {
      const p = el.progress;
      if (p !== undefined && p <= 0) return null;
      body = (
        <path transform={`translate(${el.x} ${el.y})`} d={el.d} fill={paint(el.fill, defs, k) ?? "none"} stroke={el.stroke} strokeWidth={el.strokeW}
          strokeLinecap={el.cap ?? "round"} strokeLinejoin="round"
          {...(p !== undefined && p < 1 ? { pathLength: 1, strokeDasharray: `${p} 1` } : el.dash ? { strokeDasharray: el.dash.join(" "), strokeDashoffset: el.dashOffset ?? 0 } : {})} />
      );
      break;
    }
    case "figure": {
      const hr = el.w * 0.32;
      body = (
        <g fill={el.fill}>
          <circle cx={cx} cy={el.y + hr} r={hr} />
          <rect x={el.x} y={el.y + hr * 2.25} width={el.w} height={el.h - hr * 2.25} rx={el.w * 0.42} />
        </g>
      );
      break;
    }
    case "character":
      body = <g transform={`translate(${el.x} ${el.y})`}><Character el={el} /></g>;
      break;
  }
  return <g key={k} transform={transform} opacity={op} style={style}>{body}</g>;
}

export const SceneSvg: React.FC<{ frame: SceneFrame; W: number; H: number; frameNo: number }> = ({ frame, W, H, frameNo }) => {
  gid = 0;
  const defs: React.ReactNode[] = [];
  const sorted = frame.els.map((e, i) => ({ e, i })).sort((a, b) => (a.e.z ?? 0) - (b.e.z ?? 0) || a.i - b.i);
  const world = sorted.filter((x) => x.e.layer !== "screen");
  const screen = sorted.filter((x) => x.e.layer === "screen");
  const bg = paint(frame.bg, defs, "bg");
  const cam = frame.camera;
  const camT = cam ? `translate(${W / 2} ${H / 2}) scale(${cam.zoom}) translate(${-cam.x} ${-cam.y})` : undefined;
  const worldNodes = world.map(({ e, i }) => renderElem(e, defs, H, `w${i}`));
  const screenNodes = screen.map(({ e, i }) => renderElem(e, defs, H, `s${i}`));
  const vig = frame.vignette ?? 0, grain = frame.grain ?? 0;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" style={{ position: "absolute", inset: 0 }}>
      <defs>
        {defs}
        <radialGradient id="vh-vignette" cx="0.5" cy="0.5" r="0.75">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity={Math.min(0.85, vig * 0.7)} />
        </radialGradient>
        <filter id="vh-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={frameNo % 997} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>
      <rect x={0} y={0} width={W} height={H} fill={bg} />
      <g transform={camT}>{worldNodes}</g>
      {screenNodes}
      {vig > 0 ? <rect x={0} y={0} width={W} height={H} fill="url(#vh-vignette)" /> : null}
      {grain > 0 ? <rect x={0} y={0} width={W} height={H} filter="url(#vh-grain)" opacity={grain * 0.32} style={{ mixBlendMode: "overlay" }} /> : null}
    </svg>
  );
};
