import React from "react";
import { Composition } from "remotion";
import { makeMain } from "./Main.tsx";
import type { LocalModule, MainProps } from "./props.ts";

export function makeRoot(locals: Record<string, LocalModule>): React.FC {
  const Main = makeMain(locals);
  return function Root() {
    return (
      <Composition
        id="Main"
        component={Main as React.FC<any>}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={30}
        defaultProps={{} as any}
        calculateMetadata={({ props }) => {
          const p = props as unknown as MainProps;
          const end = Math.max(...p.storyboard.shots.map((s) => s.end), p.voice?.duration ?? 0);
          return { width: p.canvas.w, height: p.canvas.h, fps: p.canvas.fps, durationInFrames: Math.max(1, Math.ceil(end * p.canvas.fps)) };
        }}
      />
    );
  };
}
