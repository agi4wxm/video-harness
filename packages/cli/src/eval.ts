// 合成评测集：随机分镜 × 内置积木 → 渲染。因为每一帧都来自场景图，切点 / 转场 / 文字出现时刻都是精确真值。
// 用途：评测 analyze/ 的切点与节拍检测（以及以后的元素检测），也作为渲染回归测试。
import { join } from "node:path";
import { KITS, PACKS, Storyboard, inspect, seeded, textEvents, type EvalEnv } from "@video-harness/core";
import { renderProject } from "@video-harness/runtime/node";
import { log, writeJson } from "./util.ts";

const TITLES = ["Why cells divide", "The hidden cost", "A tiny machine", "Part 2: the fix", "What happens next", "Under the microscope"];
const LABELS = ["survive", "respond to treatment", "recover fully", "relapse", "get side effects"];

function synthParams(kit: string, r: () => number, ex: any): any {
  const p = structuredClone(ex);
  if (kit === "kit/title-card") { p.title = TITLES[Math.floor(r() * TITLES.length)]; p.decor = ["orbs", "rays", "none"][Math.floor(r() * 3)]; }
  if (kit === "kit/stat-crowd") { p.from = +(r() * 0.3).toFixed(2); p.to = +(0.4 + r() * 0.6).toFixed(2); p.label = LABELS[Math.floor(r() * LABELS.length)]; p.total = [50, 100, 120][Math.floor(r() * 3)]; }
  if (kit === "kit/character-scene") { p.camera = [{ at: 0, x: 0.5, y: 0.5, zoom: 1 }, { at: 3, x: 0.4 + r() * 0.2, y: 0.5 + r() * 0.1, zoom: 1 + r() * 0.5 }]; }
  if (kit === "kit/scale-zoom") { p.levels = p.levels.slice(0, 2 + Math.floor(r() * (p.levels.length - 1))); }
  return p;
}

export async function evalSynth(out: string, n: number, seed: number, scale: number): Promise<Record<string, unknown>> {
  const ids = Object.keys(KITS);
  const made: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = seeded(seed * 1000 + i);
    const shots: any[] = [];
    let t = 0;
    const count = 5 + Math.floor(r() * 3);
    for (let k = 0; k < count; k++) {
      const kit = KITS[ids[Math.floor(r() * ids.length)]];
      const [lo, hi] = [Math.max(kit.duration[0], 2.2), Math.min(kit.duration[1], 6)];
      const dur = +(lo + r() * (hi - lo)).toFixed(2);
      const tr = k === 0 || r() < 0.6 ? { kind: "cut", duration: 0 } : { kind: ["fade", "push-left", "wipe", "zoom"][Math.floor(r() * 4)], duration: 0.4 };
      shots.push({ id: `s${k + 1}`, start: +t.toFixed(2), end: +(t + dur).toFixed(2), chapter: ["day", "night", "sepia"][Math.floor(r() * 3)], scene: { kind: "kit", kit: kit.id, params: synthParams(kit.id, r, kit.examples[0].params) }, transition: tr, beats: [{ t: +t.toFixed(2), idea: "synthetic" }] });
      t += dur;
    }
    const storyboard = Storyboard.parse({ version: 2, approved: true, shots });
    const dir = join(out, `v${String(i + 1).padStart(2, "0")}`);
    writeJson(join(dir, "vh.json"), { name: `synthetic-${i + 1}`, canvas: { w: 1920, h: 1080, fps: 30 }, design: "illustrated" });
    writeJson(join(dir, "storyboard.json"), storyboard);
    const env: EvalEnv = { W: 1920, H: 1080, fps: 30, pack: PACKS.illustrated, storyboard };
    const events = textEvents(inspect(env, 1 / 30));
    writeJson(join(dir, "truth.json"), {
      duration: t,
      cuts: storyboard.shots.slice(1).map((s) => ({ t: s.start, kind: s.transition.kind, duration: s.transition.duration })),
      text_events: events,
      production: storyboard.shots.map((s) => ({ start: s.start, end: s.end, label: "code_render", kit: (s.scene as any).kit })),
    });
    log(`synth ${i + 1}/${n}: ${count} shots, ${t.toFixed(1)}s`);
    await renderProject({ projectDir: dir, props: { canvas: { w: 1920, h: 1080, fps: 30 }, pack: PACKS.illustrated, storyboard, voice: null, prerendered: {} }, locals: {}, out: join(dir, "video.mp4"), scale, crf: 20 });
    made.push(dir);
  }
  return { out, videos: made, next: `cd analyze && python -m vh_analyze eval-synth ${out}` };
}
