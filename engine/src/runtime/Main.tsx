// 运行时：读取分镜 + 语音，按素材 id 组装版式、镜头、转场、字幕与音频。
import React, { useEffect, useMemo, useState } from "react";
import { AbsoluteFill, Audio, Sequence, continueRender, delayRender, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { SegmentContext, ThemeContext, type Theme, useTheme } from "../../../library/_sdk";
import { COMPONENTS, PRESETS, TRANSITIONS } from "../generated/registry";
import { SCHEMAS } from "../generated/schemas";
import { buildCaptions, type CaptionLine } from "./captions";
import { loadFonts } from "./fonts";
import { type MainProps, stripVersion } from "./types";

function resolve<T>(table: Record<string, T>, ref: string, what: string): T {
  const hit = table[stripVersion(ref)];
  if (!hit) throw new Error(`未找到${what}：${ref}（是否已运行 npm run index？）`);
  return hit;
}

const TransitionIn: React.FC<{ fn?: (p: number) => React.CSSProperties; frames: number; children: React.ReactNode }> = ({ fn, frames, children }) => {
  const frame = useCurrentFrame();
  const style = fn && frames > 0 ? fn(interpolate(frame, [0, frames], [0, 1], { extrapolateRight: "clamp" })) : {};
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};

const Captions: React.FC<{ lines: CaptionLine[] }> = ({ lines }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { style, H } = useTheme();
  const t = frame / fps;
  const cur = lines.find((l) => t >= l.s && t < l.e);
  if (!cur) return null;
  return (
    <div
      style={{
        background: style.color.captionBg,
        color: style.color.captionFg,
        fontFamily: style.font.sans,
        fontWeight: 700,
        fontSize: Math.round(style.type.caption * H),
        lineHeight: 1.2,
        padding: `${Math.round(style.type.caption * H * 0.25)}px ${Math.round(style.type.caption * H * 0.6)}px`,
        borderRadius: Math.round(style.type.caption * H * 0.25),
        whiteSpace: "nowrap",
      }}
    >
      {cur.text}
    </div>
  );
};

export const Main: React.FC<MainProps> = ({ storyboard, voice }) => {
  const { fps, width: W, height: H } = useVideoConfig();
  const [handle] = useState(() => delayRender("fonts"));
  useEffect(() => {
    loadFonts(JSON.stringify(storyboard) + (voice ? voice.words.map((w) => w.w).join("") : ""))
      .then(() => continueRender(handle))
      .catch(() => continueRender(handle));
  }, [handle, storyboard, voice]);

  const theme: Theme = useMemo(
    () => ({ style: resolve(PRESETS, storyboard.style, "风格预设").tokens, motion: resolve(PRESETS, storyboard.motion, "动效预设").tokens, W, H }),
    [storyboard.style, storyboard.motion, W, H],
  );
  const L = theme.style.layout;
  const box = { w: (L.content.x1 - L.content.x0) * W, h: (L.content.y1 - L.content.y0) * H };
  const captions = useMemo(() => (voice ? buildCaptions(voice, L.captionMaxChars) : []), [voice, L.captionMaxChars]);

  const shots = storyboard.shots.map((s) => {
    const comp = resolve(COMPONENTS, s.block, "积木").component;
    const schema = SCHEMAS[stripVersion(s.block)];
    const params = schema ? schema.parse(s.params) : s.params;
    const from = Math.round(s.start * fps);
    const dur = Math.max(1, Math.round(s.end * fps) - from);
    const tr = storyboard.transitions.find((x) => x.between[1] === s.id);
    const trFn = tr ? resolve(TRANSITIONS, tr.asset, "转场").fn : undefined;
    const Comp = comp;
    return (
      <Sequence key={s.id} from={from} durationInFrames={dur} name={`${s.id} · ${stripVersion(s.block)}`}>
        <SegmentContext.Provider value={{ id: s.id, durationInFrames: dur, box, beats: s.beats.map((b) => Math.round((b.t - s.start) * fps)) }}>
          <TransitionIn fn={trFn} frames={tr ? Math.round(tr.duration_s * fps) : 0}>
            <Comp {...params} />
          </TransitionIn>
        </SegmentContext.Provider>
      </Sequence>
    );
  });

  const tpl = storyboard.template ?? { id: "element/window-frame", topic: "" };
  const Template = resolve(COMPONENTS, tpl.id, "版式").component;
  return (
    <ThemeContext.Provider value={theme}>
      <Template topic={tpl.topic} tag={tpl.tag} content={<AbsoluteFill>{shots}</AbsoluteFill>} caption={<Captions lines={captions} />} />
      {voice?.audio ? <Audio src={staticFile(voice.audio)} /> : null}
      {storyboard.music?.src ? <Audio src={staticFile(storyboard.music.src)} volume={Math.pow(10, -(storyboard.music.duck_db ?? 12) / 20)} /> : null}
    </ThemeContext.Provider>
  );
};
