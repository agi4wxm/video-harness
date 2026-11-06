// 扫描 library/**/asset.yaml：
//   1. 校验清单（docs/03 §2）；
//   2. 把参数 schema（zod）转成 JSON Schema，写入 library/index.json —— MCP server 用它做检索与参数说明；
//   3. 生成 engine/src/generated/{registry,schemas}.ts —— 运行时按素材 id 找到组件 / 预设 / 转场。
// 清单是唯一事实来源，index.json 与 generated/ 随时可重建。
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "yaml";
import { zodToJsonSchema } from "zod-to-json-schema";

const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolve(ENGINE, "..");
const LIB = join(ROOT, "library");
const GEN = join(ENGINE, "src", "generated");

const KINDS = new Set([
  "media.image", "media.icon", "media.logo", "media.svg", "media.video", "media.model3d", "media.hdri", "media.material",
  "media.lottie", "media.font", "media.lut", "media.music", "media.sfx", "media.ambience",
  "element", "block", "effect", "transition", "motion", "camera", "rig3d",
  "preset.style", "preset.motion", "preset.caption", "preset.grade", "preset.mix",
  "technique.edit", "recipe", "narrative", "metaphor", "exemplar",
]);
const CODE_KINDS = new Set(["element", "block", "effect", "transition", "motion", "camera", "rig3d"]);
const STATUS = new Set(["draft", "verified", "golden", "deprecated"]);
const ID_RE = /^([a-z0-9.]+)\/([a-z0-9-]+)@(\d+\.\d+\.\d+)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name === "asset.yaml") out.push(p);
  }
  return out;
}

type Asset = Record<string, any> & { id: string; kind: string; dir: string };

const errors: string[] = [];
const assets: Asset[] = [];
for (const file of walk(LIB).sort()) {
  const dir = dirname(file);
  const rel = relative(ROOT, dir);
  const a = parse(readFileSync(file, "utf8")) as Asset;
  const m = ID_RE.exec(a.id ?? "");
  if (!m) { errors.push(`${rel}: id 格式应为 kind/name@x.y.z，实际 ${a.id}`); continue; }
  if (m[1] !== a.kind) errors.push(`${rel}: id 前缀 ${m[1]} 与 kind ${a.kind} 不一致`);
  if (!KINDS.has(a.kind)) errors.push(`${rel}: 未知 kind ${a.kind}`);
  if (!a.title) errors.push(`${rel}: 缺少 title`);
  if (!a.provenance?.source || !a.provenance?.license) errors.push(`${rel}: provenance.source / license 必填（规范 H15）`);
  if (!STATUS.has(a.quality?.status)) errors.push(`${rel}: quality.status 必须是 ${[...STATUS].join("/")}`);
  if (a.entry && !String(a.entry).startsWith("npm:") && !existsSync(join(dir, a.entry))) errors.push(`${rel}: entry 不存在 ${a.entry}`);
  if (CODE_KINDS.has(a.kind) && !a.entry) errors.push(`${rel}: 代码类素材必须有 entry`);
  a.dir = rel;
  assets.push(a);
}
const ids = new Set(assets.map((a) => a.id));
for (const a of assets) {
  for (const d of a.deps ?? []) if (!ids.has(d)) errors.push(`${a.dir}: 依赖不存在 ${d}`);
}

// 参数 schema → JSON Schema
for (const a of assets) {
  if (!a.params_schema) continue;
  const mod = await import(pathToFileURL(join(ROOT, a.dir, a.params_schema)).href);
  if (!mod.schema) { errors.push(`${a.dir}: ${a.params_schema} 必须导出 schema`); continue; }
  a.params_json_schema = zodToJsonSchema(mod.schema, { $refStrategy: "none" });
  for (const ex of a.examples ?? []) {
    const r = mod.schema.safeParse(ex.params);
    if (!r.success) errors.push(`${a.dir}: 示例「${ex.name}」不符合参数 schema：${r.error.issues.map((i: any) => i.path.join(".") + " " + i.message).join("; ")}`);
  }
}

if (errors.length) {
  console.error("素材库校验失败：\n" + errors.map((e) => "  - " + e).join("\n"));
  process.exit(1);
}

const index = {
  schema: "0.1.0",
  assets: assets.map(({ dir, ...a }) => ({ ...a, path: dir })),
};
writeFileSync(join(LIB, "index.json"), JSON.stringify(index, null, 2) + "\n");

// 运行时注册表
mkdirSync(GEN, { recursive: true });
const imp = (a: Asset, file: string) => relative(GEN, join(ROOT, a.dir, file)).replace(/\\/g, "/").replace(/\.tsx?$/, "");
const name = (id: string) => id.split("@")[0];
const lines: string[] = ["// 由 engine/scripts/build-index.ts 生成，请勿手改。", "/* eslint-disable */", 'import type React from "react";'];
const comps: string[] = [], trans: string[] = [], presets: string[] = [];
assets.forEach((a, i) => {
  if (a.kind === "block" || a.kind === "element") {
    lines.push(`import c${i} from "${imp(a, a.entry)}";`);
    comps.push(`  "${name(a.id)}": { version: "${a.id.split("@")[1]}", component: c${i} },`);
  } else if (a.kind === "transition") {
    lines.push(`import t${i} from "${imp(a, a.entry)}";`);
    trans.push(`  "${name(a.id)}": { version: "${a.id.split("@")[1]}", fn: t${i} },`);
  } else if (a.kind.startsWith("preset.")) {
    lines.push(`import p${i} from "${relative(GEN, join(ROOT, a.dir, a.entry)).replace(/\\/g, "/")}";`);
    presets.push(`  "${name(a.id)}": { version: "${a.id.split("@")[1]}", tokens: p${i} as any },`);
  }
});
lines.push(
  "",
  "export const COMPONENTS: Record<string, { version: string; component: React.FC<any> }> = {",
  ...comps,
  "};",
  "export const TRANSITIONS: Record<string, { version: string; fn: (p: number) => React.CSSProperties }> = {",
  ...trans,
  "};",
  "export const PRESETS: Record<string, { version: string; tokens: any }> = {",
  ...presets,
  "};",
  "",
);
writeFileSync(join(GEN, "registry.ts"), lines.join("\n"));

const sl: string[] = ["// 由 engine/scripts/build-index.ts 生成，请勿手改。", 'import type { ZodTypeAny } from "zod";'];
const se: string[] = [];
assets.forEach((a, i) => {
  if (!a.params_schema) return;
  sl.push(`import { schema as s${i} } from "${imp(a, a.params_schema)}";`);
  se.push(`  "${name(a.id)}": s${i},`);
});
sl.push("", "export const SCHEMAS: Record<string, ZodTypeAny> = {", ...se, "};", "");
writeFileSync(join(GEN, "schemas.ts"), sl.join("\n"));

console.log(JSON.stringify({ assets: assets.length, components: comps.length, transitions: trans.length, presets: presets.length }));
