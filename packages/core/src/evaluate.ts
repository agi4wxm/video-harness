// 求值：给定分镜和时刻，得到该时刻的场景图。runtime 渲染与 Node 端 inspect 共用这一份逻辑。
import { loadPack, resolveDesign, type DesignPackT, type ResolvedDesign } from "./design.ts";
import type { Kit, KitCtx } from "./kit.ts";
import { KITS } from "./kits/index.ts";
import { hashSeed } from "./motion.ts";
import type { ShotT, StoryboardT } from "./project.ts";
import { fitSize, textBox } from "./text.ts";
import type { Camera, El, SceneFrame, ScreenBox, TextEl } from "./types.ts";

/** 本地镜头模块（kind: local）：与积木同形，但不需要 schema。 */
export interface LocalScene {
  timeline(params: Record<string, unknown>, ctx: KitCtx): SceneFrame;
}

export interface EvalEnv {
  W: number;
  H: number;
  fps: number;
  pack: DesignPackT;
  storyboard: StoryboardT;
  locals?: Record<string, LocalScene>;
}

const designCache = new WeakMap<object, Map<string, ResolvedDesign>>();
export function designFor(env: EvalEnv, chapter?: string): ResolvedDesign {
  let m = designCache.get(env);
  if (!m) { m = new Map(); designCache.set(env, m); }
  const k = chapter ?? "";
  let d = m.get(k);
  if (!d) { d = resolveDesign(env.pack, { W: env.W, H: env.H, chapter, semantic: env.storyboard.semantic }); m.set(k, d); }
  return d;
}

export function shotCtx(env: EvalEnv, shot: ShotT, tLocal: number): KitCtx {
  return {
    t: tLocal, dur: shot.end - shot.start, fps: env.fps, W: env.W, H: env.H, d: designFor(env, shot.chapter),
    seed: hashSeed(shot.id), beats: shot.beats.map((b) => b.t - shot.start),
  };
}

export function kitOf(shot: ShotT): Kit | null {
  return shot.scene.kind === "kit" ? KITS[shot.scene.kit] ?? null : null;
}

/** 解析并校验积木参数（带默认值）。 */
export function kitParams(shot: ShotT): unknown {
  if (shot.scene.kind !== "kit") return shot.scene.kind === "html" ? {} : shot.scene.params;
  const k = KITS[shot.scene.kit];
  if (!k) throw new Error(`未知积木 ${shot.scene.kit}（可用：${Object.keys(KITS).join(", ")}）`);
  const r = k.schema.safeParse(shot.scene.params);
  if (!r.success) throw new Error(`${shot.id} 参数不合法：${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return r.data;
}

/** 镜头内 tLocal 时刻的场景图；html / react 镜头返回 null（由 runtime 直接播放，inspect 走浏览器导出）。 */
export function shotFrame(env: EvalEnv, shot: ShotT, tLocal: number, params = kitParams(shot)): SceneFrame | null {
  // 转场入场期间（tLocal < 0）显示首帧；积木只需处理 [0, dur]
  const ctx = shotCtx(env, shot, Math.min(Math.max(0, tLocal), shot.end - shot.start));
  if (shot.scene.kind === "kit") return KITS[shot.scene.kit].timeline(params as never, ctx);
  if (shot.scene.kind === "local") {
    const m = env.locals?.[shot.id];
    if (!m) throw new Error(`本地镜头 ${shot.id} 未加载（${shot.scene.entry}）`);
    return m.timeline(params as Record<string, unknown>, ctx);
  }
  return null;
}

export function shotAt(sb: StoryboardT, t: number): ShotT | undefined {
  return sb.shots.find((s) => t >= s.start && t < s.end) ?? (t >= sb.shots[sb.shots.length - 1].end ? undefined : undefined);
}

/** 元素在屏幕上的框：先按 scale 绕中心缩放，再套相机（screen 层不受相机影响）。 */
export function screenBox(el: El, camera: Camera | undefined, W: number, H: number): ScreenBox {
  const s = el.scale ?? 1;
  let x = el.x + (el.w * (1 - s)) / 2, y = el.y + (el.h * (1 - s)) / 2, w = el.w * s, h = el.h * s;
  if (camera && el.layer !== "screen") {
    const z = camera.zoom;
    x = (x - camera.x) * z + W / 2;
    y = (y - camera.y) * z + H / 2;
    w *= z;
    h *= z;
  }
  return { x, y, w, h };
}

export function loadDesign(ref: string, custom?: unknown): DesignPackT {
  return loadPack(ref, custom);
}

/** 字幕（可选）：按语句时间显示，供 runtime 和 inspect 共用。 */
export function captionAt(env: EvalEnv, voice: { segments: Array<{ text: string; s: number; e: number }> } | null, t: number): TextEl | null {
  if (!env.storyboard.captions.enabled || !voice) return null;
  const seg = voice.segments.find((x) => t >= x.s && t < x.e + 0.15);
  if (!seg) return null;
  const d = designFor(env);
  const size = fitSize(seg.text, d.type.caption, (d.safe.x1 - d.safe.x0) * 0.9, "sans");
  const b = textBox(seg.text, size, "sans", env.W / 2, d.safe.y1 - size, "center");
  return { type: "text", id: `caption:${seg.s}`, text: seg.text, font: "sans", size, weight: 600, color: d.palette.surface, on: d.palette.ink, role: "caption", layer: "screen", ...b };
}
