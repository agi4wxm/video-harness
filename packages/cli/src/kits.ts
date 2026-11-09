import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";
import { KITS, PACKS, Storyboard } from "@video-harness/core";
import { renderProject } from "@video-harness/runtime/node";
import { VhError } from "./util.ts";

export function kitsList() {
  return Object.values(KITS).map((k) => ({ id: k.id, title: k.title, summary: k.summary, duration: k.duration, tags: k.tags }));
}

export function kitShow(id: string) {
  const k = KITS[id] ?? KITS[`kit/${id}`];
  if (!k) throw new VhError(`未知积木 ${id}`, "vh kits");
  return { id: k.id, title: k.title, summary: k.summary, duration: k.duration, tags: k.tags, params: zodToJsonSchema(k.schema, { $refStrategy: "none" }), examples: k.examples };
}

/** 用示例参数渲染 4 个时刻的拼图，先看效果再决定用不用。 */
export async function kitPreview(id: string, out: string, chapter?: string) {
  const k = KITS[id] ?? KITS[`kit/${id}`];
  if (!k) throw new VhError(`未知积木 ${id}`, "vh kits");
  const ex = k.examples[0];
  const storyboard = Storyboard.parse({ version: 2, shots: [{ id: "preview", start: 0, end: ex.duration, chapter, scene: { kind: "kit", kit: k.id, params: ex.params }, beats: [{ t: 0, idea: "preview" }] }] });
  const dir = mkdtempSync(join(tmpdir(), "vh-kit-"));
  writeFileSync(join(dir, "vh.json"), "{}");
  const ts = [0.25, 0.5, 0.75, 0.98].map((f) => +(ex.duration * f).toFixed(2));
  return renderProject({ projectDir: dir, props: { canvas: { w: 1920, h: 1080, fps: 30 }, pack: PACKS.illustrated, storyboard, voice: null, prerendered: {} }, locals: {}, out, stills: ts, scale: 0.5 });
}
