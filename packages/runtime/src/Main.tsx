// 合成器：每个镜头一个 Sequence；转场让下一镜提前 duration 入场、与上一镜尾部重叠。
import React, { useEffect, useMemo, useState } from "react";
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, continueRender, delayRender, staticFile, useCurrentFrame } from "remotion";
import { captionAt, clamp, ease, kitParams, shotFrame, type EvalEnv, type LocalScene, type ShotT } from "@video-harness/core";
import { loadFonts } from "./fonts.ts";
import type { LocalModule, MainProps } from "./props.ts";
import { SceneSvg } from "./SceneSvg.tsx";

function transitionStyle(kind: ShotT["transition"]["kind"], p: number, W: number, H: number): React.CSSProperties {
  const e = ease([0.65, 0, 0.35, 1], clamp(p));
  switch (kind) {
    case "fade": return { opacity: e };
    case "push-left": return { transform: `translateX(${(1 - e) * W}px)` };
    case "push-up": return { transform: `translateY(${(1 - e) * H}px)` };
    case "zoom": return { opacity: e, transform: `scale(${0.6 + 0.4 * e})` };
    case "wipe": return { clipPath: `inset(0 ${(1 - e) * 100}% 0 0)` };
    default: return {};
  }
}

const ShotView: React.FC<{ env: EvalEnv; shot: ShotT; lead: number; locals: Record<string, LocalModule>; prerendered: Record<string, string> }> = ({ env, shot, lead, locals, prerendered }) => {
  const frame = useCurrentFrame();
  const tLocal = (frame - lead) / env.fps;
  const params = useMemo(() => kitParams(shot), [shot]);
  const style = shot.transition.kind !== "cut" && lead > 0 ? transitionStyle(shot.transition.kind, frame / lead, env.W, env.H) : {};
  let content: React.ReactNode;
  if (shot.scene.kind === "html") {
    const src = prerendered[shot.id];
    content = src ? <Sequence from={lead} layout="none"><OffthreadVideo src={staticFile(src)} muted /></Sequence> : <Missing text={`html 镜头 ${shot.id} 尚未预渲染：运行 vh build`} />;
  } else if (shot.scene.kind === "react") {
    const C = locals[shot.id]?.default;
    content = C ? <Sequence from={lead} layout="none"><C params={shot.scene.params} /></Sequence> : <Missing text={`react 镜头 ${shot.id} 未导出默认组件`} />;
  } else {
    const f = shotFrame(env, shot, Math.max(0, tLocal), params);
    content = f ? <SceneSvg frame={f} W={env.W} H={env.H} frameNo={frame} /> : null;
  }
  return <AbsoluteFill style={style}>{content}</AbsoluteFill>;
};

const Missing: React.FC<{ text: string }> = ({ text }) => (
  <AbsoluteFill style={{ background: "#300", color: "#fff", fontSize: 40, alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>{text}</AbsoluteFill>
);

const Captions: React.FC<{ env: EvalEnv; voice: MainProps["voice"] }> = ({ env, voice }) => {
  const frame = useCurrentFrame();
  const el = captionAt(env, voice, frame / env.fps);
  if (!el) return null;
  const pad = el.size * 0.35;
  return (
    <AbsoluteFill>
      <svg width={env.W} height={env.H} style={{ position: "absolute", inset: 0 }}>
        <rect x={el.x - pad} y={el.y - pad * 0.4} width={el.w + 2 * pad} height={el.h + pad * 0.8} rx={pad} fill={el.on} opacity={0.85} />
        <text x={el.x + el.w / 2} y={el.y + el.h / 2} dominantBaseline="central" textAnchor="middle" fontFamily="'Inter', 'Noto Sans SC', sans-serif" fontSize={el.size} fontWeight={600} fill={el.color}>{el.text}</text>
      </svg>
    </AbsoluteFill>
  );
};

export function makeMain(locals: Record<string, LocalModule>): React.FC<MainProps> {
  return function Main(props: MainProps) {
    const { canvas, pack, storyboard, voice, prerendered } = props;
    const env: EvalEnv = useMemo(() => ({
      W: canvas.w, H: canvas.h, fps: canvas.fps, pack, storyboard,
      locals: Object.fromEntries(Object.entries(locals).filter(([, m]) => typeof m.timeline === "function")) as Record<string, LocalScene>,
    }), [canvas, pack, storyboard]);
    const [handle] = useState(() => delayRender("fonts"));
    useEffect(() => {
      loadFonts(JSON.stringify(storyboard) + (voice?.segments.map((s) => s.text).join("") ?? "")).finally(() => continueRender(handle));
    }, [handle, storyboard, voice]);
    const fps = canvas.fps;
    const shots = storyboard.shots.map((s, i) => {
      const lead = i > 0 && s.transition.kind !== "cut" ? Math.round(s.transition.duration * fps) : 0;
      const from = Math.round(s.start * fps) - lead;
      const dur = Math.max(1, Math.round(s.end * fps) - Math.round(s.start * fps) + lead);
      return (
        <Sequence key={s.id} from={from} durationInFrames={dur} name={`${s.id} · ${s.scene.kind === "kit" ? s.scene.kit : s.scene.kind}`}>
          <ShotView env={env} shot={s} lead={lead} locals={locals} prerendered={prerendered} />
        </Sequence>
      );
    });
    // 人声出现时压低配乐（ducking）
    const music = storyboard.music;
    const musicVolume = (f: number) => {
      if (!music) return 0;
      const t = f / fps;
      const speaking = voice?.segments.some((g) => t >= g.s - 0.15 && t <= g.e + 0.25) ?? false;
      return Math.pow(10, (music.gain_db - (speaking ? music.duck_db : 0)) / 20);
    };
    return (
      <AbsoluteFill style={{ background: pack.palette.bg }}>
        {shots}
        <Captions env={env} voice={voice} />
        {voice?.audio ? <Audio src={staticFile(voice.audio)} /> : null}
        {music ? <Audio src={staticFile(music.src)} volume={musicVolume} /> : null}
      </AbsoluteFill>
    );
  };
}
