import React from "react";
import { Composition } from "remotion";
import { Main } from "./runtime/Main";
import { Storyboard, type MainProps } from "./runtime/types";

const placeholder: MainProps = {
  storyboard: Storyboard.parse({
    version: 1,
    canvas: { w: 1080, h: 1920, fps: 30 },
    template: { topic: "video-harness", tag: "PREVIEW" },
    shots: [{ id: "s1", start: 0, end: 2, block: "block/title-kinetic", params: { lines: ["video-harness"] } }],
  }),
  voice: null,
};

export const Root: React.FC = () => (
  <Composition
    id="Main"
    component={Main as React.FC<any>}
    defaultProps={placeholder as any}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={60}
    calculateMetadata={({ props }) => {
      const p = props as unknown as MainProps;
      const sb = p.storyboard;
      const end = Math.max(...sb.shots.map((s) => s.end), p.voice?.segments.at(-1)?.e ?? 0);
      return { width: sb.canvas.w, height: sb.canvas.h, fps: sb.canvas.fps, durationInFrames: Math.max(1, Math.ceil(end * sb.canvas.fps)) };
    }}
  />
);
