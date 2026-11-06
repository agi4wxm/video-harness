// 积木：素材窗口。对应参考集 live-footage 段（竖屏 46%）：图片 / 视频 + 缓慢推拉 + 标注 + 高亮框。
import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from "remotion";
import { useEnter, useFontPx, useProgress, useSegment, useTheme } from "../../_sdk";
import type { Params } from "./schema";

const Callout: React.FC<{ c: Params["callouts"][number] }> = ({ c }) => {
  const { style } = useTheme();
  const { box } = useSegment();
  const enter = useEnter({ delayS: c.at, mode: "pop" });
  const px = useFontPx("body");
  const col = style.color[c.color];
  return (
    <div
      style={{
        position: "absolute",
        left: c.x * box.w,
        top: c.y * box.h,
        transform: `translate(-50%, -50%) ${enter.transform ?? ""}`,
        opacity: enter.opacity,
        background: col,
        color: style.color.bg,
        fontSize: px,
        fontWeight: 900,
        padding: `${px * 0.2}px ${px * 0.55}px`,
        borderRadius: px * 0.35,
        whiteSpace: "nowrap",
        boxShadow: `0 ${px * 0.2}px ${px * 0.8}px #00000088`,
      }}
    >
      {c.text}
    </div>
  );
};

const HighlightBox: React.FC<{ b: NonNullable<Params["box"]> }> = ({ b }) => {
  const { style } = useTheme();
  const { box } = useSegment();
  const p = useProgress(b.at);
  const w = b.w * box.w, h = b.h * box.h;
  const per = 2 * (w + h);
  const sw = Math.max(4, Math.min(box.w, box.h) * 0.01);
  return (
    <svg style={{ position: "absolute", left: b.x * box.w, top: b.y * box.h, overflow: "visible" }} width={w} height={h}>
      <rect x={0} y={0} width={w} height={h} rx={sw * 2} fill="none" stroke={style.color.accent2} strokeWidth={sw} strokeDasharray={per} strokeDashoffset={per * (1 - p)} />
    </svg>
  );
};

export const FootageWindow: React.FC<Params> = ({ src, kind = "image", move = "in", focus = { x: 0.5, y: 0.5 }, dim = 0, callouts = [], box }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useSegment();
  const { motion, style } = useTheme();
  const t = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], { extrapolateRight: "clamp" });
  const k = motion.kenBurnsScale;
  let scale = 1 + k, tx = 0;
  if (move === "in") scale = 1 + k * t;
  if (move === "out") scale = 1 + k * (1 - t);
  if (move === "left" || move === "right") tx = (move === "left" ? -1 : 1) * k * 50 * (t - 0.5);
  const mediaStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transform: `translateX(${tx}%) scale(${move === "none" ? 1 : scale})`,
    transformOrigin: `${focus.x * 100}% ${focus.y * 100}%`,
  };
  const url = staticFile(src);
  return (
    <AbsoluteFill style={{ background: style.color.bg }}>
      {kind === "video" ? <OffthreadVideo src={url} style={mediaStyle} muted /> : <Img src={url} style={mediaStyle} />}
      {dim > 0 ? <AbsoluteFill style={{ background: style.color.bg, opacity: dim }} /> : null}
      {box ? <HighlightBox b={box} /> : null}
      {callouts.map((c, i) => (
        <Callout key={i} c={c} />
      ))}
    </AbsoluteFill>
  );
};

export default FootageWindow;
