// 版式模板：窗口面板 + 窗内字幕条 + 底部话题栏。
// 结构比例来自参考集（内容区占画面约 40%，字幕在内容区下方），视觉为原创。
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { useTheme } from "../../_sdk";

export type WindowFrameProps = {
  /** 底部话题栏文字，一般是本期问题 */
  topic: string;
  /** 面板左上角的小标签 */
  tag?: string;
  content: React.ReactNode;
  caption: React.ReactNode;
};

export const WindowFrame: React.FC<WindowFrameProps> = ({ topic, tag, content, caption }) => {
  const { style, W, H } = useTheme();
  const { color, layout, font, type } = style;
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const px = (r: number, base: number) => r * base;
  const f = layout.frame;
  const c = layout.content;
  const cb = layout.captionBand;
  const b = layout.banner;
  const radius = px(layout.radius, W);
  const grid = Math.round(W / 18);
  const progress = frame / Math.max(1, durationInFrames - 1);

  return (
    <AbsoluteFill style={{ background: color.bg, fontFamily: font.sans }}>
      {/* 背景网格 */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${color.bgGrid} 1px, transparent 1px), linear-gradient(90deg, ${color.bgGrid} 1px, transparent 1px)`,
          backgroundSize: `${grid}px ${grid}px`,
          opacity: 0.6,
        }}
      />
      {/* 面板 */}
      <div
        style={{
          position: "absolute",
          left: px(f.x0, W),
          top: px(f.y0, H),
          width: px(f.x1 - f.x0, W),
          height: px(f.y1 - f.y0, H),
          background: color.panel,
          border: `2px solid ${color.panelBorder}`,
          borderRadius: radius,
          overflow: "hidden",
        }}
      >
        {/* 标题栏：左侧标签，右侧全片进度 */}
        <div
          style={{
            height: px(layout.titleBar.h, H),
            display: "flex",
            alignItems: "center",
            padding: `0 ${radius}px`,
            borderBottom: `2px solid ${color.panelBorder}`,
            color: color.fgMuted,
            fontFamily: font.mono,
            fontSize: Math.round(type.label * H * 0.8),
            letterSpacing: 2,
            gap: radius,
          }}
        >
          <span>{tag ?? "EXPLAIN"}</span>
          <div style={{ flex: 1, height: 4, background: color.panelBorder, borderRadius: 2 }}>
            <div style={{ width: `${progress * 100}%`, height: "100%", background: color.accent, borderRadius: 2 }} />
          </div>
        </div>
      </div>
      {/* 内容区 */}
      <div
        style={{
          position: "absolute",
          left: px(c.x0, W),
          top: px(c.y0, H),
          width: px(c.x1 - c.x0, W),
          height: px(c.y1 - c.y0, H),
          overflow: "hidden",
          borderRadius: radius * 0.6,
        }}
      >
        {content}
      </div>
      {/* 字幕条 */}
      <div
        style={{
          position: "absolute",
          left: px(c.x0, W),
          top: px(cb.y0, H),
          width: px(c.x1 - c.x0, W),
          height: px(cb.y1 - cb.y0, H),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {caption}
      </div>
      {/* 底部话题栏 */}
      <div
        style={{
          position: "absolute",
          left: px(b.x0, W),
          top: px(b.y0, H),
          width: px(b.x1 - b.x0, W),
          height: px(b.y1 - b.y0, H),
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: px(0.012, H),
        }}
      >
        <div style={{ width: px(0.12, W), height: px(0.006, H), background: color.bannerAccent, borderRadius: 4 }} />
        <div
          style={{
            color: color.bannerFg,
            fontSize: Math.round(type.banner * H),
            fontWeight: 900,
            lineHeight: 1.25,
            textWrap: "balance",
          } as React.CSSProperties}
        >
          {topic}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default WindowFrame;
