// 由 engine/scripts/build-index.ts 生成，请勿手改。
/* eslint-disable */
import type React from "react";
import c0 from "../../../library/blocks/footage-window/index";
import c1 from "../../../library/blocks/mg-diagram/index";
import c2 from "../../../library/blocks/title-kinetic/index";
import c3 from "../../../library/elements/window-frame/index";
import p8 from "../../../library/presets/motion/standard/tokens.json";
import p9 from "../../../library/presets/style/mono-window/tokens.json";
import t10 from "../../../library/transitions/fade/index";
import t11 from "../../../library/transitions/push-up/index";

export const COMPONENTS: Record<string, { version: string; component: React.FC<any> }> = {
  "block/footage-window": { version: "0.1.0", component: c0 },
  "block/mg-diagram": { version: "0.1.0", component: c1 },
  "block/title-kinetic": { version: "0.1.0", component: c2 },
  "element/window-frame": { version: "0.1.0", component: c3 },
};
export const TRANSITIONS: Record<string, { version: string; fn: (p: number) => React.CSSProperties }> = {
  "transition/fade": { version: "0.1.0", fn: t10 },
  "transition/push-up": { version: "0.1.0", fn: t11 },
};
export const PRESETS: Record<string, { version: string; tokens: any }> = {
  "preset.motion/standard": { version: "0.1.0", tokens: p8 as any },
  "preset.style/mono-window": { version: "0.1.0", tokens: p9 as any },
};
