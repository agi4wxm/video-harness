// 分镜校验（docs/02：H11 时间覆盖、H13 素材级别、参数 schema、意图字段）。
//   tsx scripts/validate.ts --project <dir>
// 输出 {ok, errors[], warnings[]}；有 error 时退出码仍为 0（由调用方决定是否拦截）。
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMAS } from "../src/generated/schemas";
import { Storyboard, Voice, stripVersion } from "../src/runtime/types";

const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const i = process.argv.indexOf("--project");
const project = resolve(i >= 0 ? process.argv[i + 1] : ".");
const index = JSON.parse(readFileSync(join(ENGINE, "..", "library", "index.json"), "utf8")).assets as Array<{ id: string; quality: { status: string } }>;
const statusOf = (ref: string) => {
  const [name, ver] = ref.split("@");
  const a = index.filter((x) => x.id.split("@")[0] === name && (!ver || x.id.split("@")[1].startsWith(ver)))[0];
  return a?.quality.status;
};

const errors: string[] = [];
const warnings: string[] = [];
const raw = JSON.parse(readFileSync(join(project, "storyboard.json"), "utf8"));
const parsed = Storyboard.safeParse(raw);
if (!parsed.success) {
  console.log(JSON.stringify({ ok: false, errors: parsed.error.issues.map((x) => `storyboard.${x.path.join(".")}: ${x.message}`), warnings }));
  process.exit(0);
}
const sb = parsed.data;
const voice = existsSync(join(project, "voice.json")) ? Voice.parse(JSON.parse(readFileSync(join(project, "voice.json"), "utf8"))) : null;

// H11：镜头首尾相接、覆盖音频
const shots = [...sb.shots].sort((a, b) => a.start - b.start);
if (Math.abs(shots[0].start) > 1e-3) errors.push(`H11: 第一个镜头应从 0 开始，实际 ${shots[0].start}`);
for (let k = 1; k < shots.length; k++) {
  const gap = shots[k].start - shots[k - 1].end;
  if (Math.abs(gap) > 0.034) errors.push(`H11: ${shots[k - 1].id} 与 ${shots[k].id} 之间${gap > 0 ? "有空隙" : "重叠"} ${gap.toFixed(3)}s`);
}
if (voice) {
  const vEnd = voice.segments.at(-1)?.e ?? 0;
  const sEnd = shots.at(-1)!.end;
  if (sEnd < vEnd - 0.034) errors.push(`H11: 镜头在 ${sEnd}s 结束，但语音到 ${vEnd}s`);
}
const ids = new Set<string>();
for (const s of shots) {
  if (ids.has(s.id)) errors.push(`镜头 id 重复：${s.id}`);
  ids.add(s.id);
  if (s.end <= s.start) errors.push(`${s.id}: end 必须大于 start`);
  // 引用与 H13
  const st = statusOf(s.block);
  if (!st) errors.push(`${s.id}: 积木不存在 ${s.block}`);
  else if (st === "deprecated") errors.push(`H13: ${s.id} 使用了已弃用素材 ${s.block}`);
  else if (st === "draft") warnings.push(`H13: ${s.id} 使用了 draft 素材 ${s.block}，需人工确认`);
  // 参数
  const schema = SCHEMAS[stripVersion(s.block)];
  if (schema) {
    const r = schema.safeParse(s.params);
    if (!r.success) errors.push(...r.error.issues.map((x) => `${s.id}.params.${x.path.join(".")}: ${x.message}`));
  }
  // 意图字段（docs/02 §5）
  if (!s.intent?.focal) warnings.push(`${s.id}: 缺少 intent.focal`);
  // M1 段时长（规范 v0.1：1.0–4.4s）
  const d = s.end - s.start;
  if (d < 1.0 || d > 4.4) warnings.push(`M1: ${s.id} 时长 ${d.toFixed(2)}s 不在 1.0–4.4s（若镜头内有分步揭示可忽略）`);
}
for (const ref of [sb.style, sb.motion, sb.template?.id ?? "element/window-frame", ...sb.transitions.map((t) => t.asset)]) {
  const st = statusOf(ref);
  if (!st) errors.push(`素材不存在：${ref}`);
  else if (st === "draft") warnings.push(`H13: ${ref} 为 draft，需人工确认`);
}
for (const t of sb.transitions) {
  if (!ids.has(t.between[0]) || !ids.has(t.between[1])) errors.push(`转场引用了不存在的镜头：${t.between.join(" → ")}`);
}

console.log(JSON.stringify({ ok: errors.length === 0, errors, warnings, shots: shots.length, duration_s: shots.at(-1)!.end }));
