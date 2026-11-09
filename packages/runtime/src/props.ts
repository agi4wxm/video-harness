import type { DesignPackT, StoryboardT, VoiceT } from "@video-harness/core";

/** 渲染输入：全部是数据，项目代码（local / react 镜头）通过 entry 文件静态导入。 */
export interface MainProps {
  canvas: { w: number; h: number; fps: number };
  pack: DesignPackT;
  storyboard: StoryboardT;
  voice: VoiceT | null;
  /** html 镜头预渲染结果：shot id → 相对 public/ 的视频路径 */
  prerendered: Record<string, string>;
}

export type LocalModule = {
  timeline?: (params: Record<string, unknown>, ctx: unknown) => unknown;
  default?: React.ComponentType<{ params: Record<string, unknown> }>;
};
