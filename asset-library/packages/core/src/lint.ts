// 校验：格式之外的规则——文件存在、依赖可解析、提交审查所需字段齐全、来源与授权、真实人物 / 品牌限制。
import type { Library } from "./store.ts";
import type { EntryT } from "./schema.ts";
import { subtypeOf } from "./taxonomy.ts";

export interface LintIssue { id: string; level: "error" | "warn"; rule: string; message: string }

const isEmpty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0);

/** 提交审查 / 通过前必须满足的条件（返回问题列表，空 = 满足） */
export function readinessProblems(lib: Library, e: EntryT): string[] {
  const out: string[] = [];
  const st = subtypeOf(e.type)!;
  for (const k of st.subtype.requiredForReview) if (isEmpty(e.spec[k])) out.push(`spec.${k} 未填写（${st.subtype.name}提交审查必填）`);
  if (!e.previews.length) out.push("没有预览（审查只看预览）");
  for (const p of e.previews) if (!lib.refExists(e.id, p)) out.push(`预览文件不存在：${p}`);
  if (!e.summary.trim()) out.push("summary 未填写");
  out.push(...provenanceProblems(e));
  return out;
}

function provenanceProblems(e: EntryT): string[] {
  const out: string[] = [];
  const p = e.provenance;
  if (p.kind === "generated" && (!p.generator?.model || !p.generator?.prompt)) out.push("模型生成的素材必须记录 generator.model 和 generator.prompt");
  if (p.kind === "licensed" && !p.license) out.push("外部授权素材必须填写 license");
  if (p.kind === "decomposed" && !p.derived_from.length) out.push("拆解来的素材必须填写 derived_from（来自哪条视频的哪一段）");
  if (p.kind === "generated" && p.restrictions.includes("real-person")) out.push("不能用模型生成真实人物（real-person）");
  if (e.type === "content.brand" && !p.restrictions.includes("brand")) out.push("标识类素材必须标注 restrictions: brand");
  return out;
}

export function lint(lib: Library, only?: string[]): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const li of lib.loadIssues) issues.push({ id: li.path, level: "error", rule: "format", message: li.message });
  const all = lib.entries();
  const ids = new Map(all.map((e) => [e.id, e]));
  for (const e of all) {
    if (only && !only.includes(e.id)) continue;
    const add = (level: LintIssue["level"], rule: string, message: string) => issues.push({ id: e.id, level, rule, message });
    if (!e.id.startsWith(e.type + "/")) add("error", "id", `id 前缀应为 ${e.type}/`);
    for (const [role, ref] of Object.entries(e.files)) if (!lib.refExists(e.id, ref)) add(ref.startsWith("blob:") ? "warn" : "error", "file", `files.${role} 不存在：${ref}${ref.startsWith("blob:") ? "（大文件不在本机 blobs/，可能需要同步）" : ""}`);
    for (const ref of e.previews) if (!lib.refExists(e.id, ref)) add(ref.startsWith("blob:") ? "warn" : "error", "preview", `预览不存在：${ref}`);
    for (const d of e.deps) {
      const [did, ver] = d.split("@");
      const t = ids.get(did);
      if (!t) add("error", "deps", `依赖的条目不存在：${did}`);
      else if (ver && t.version.split(".")[0] !== ver.split(".")[0]) add("warn", "deps", `依赖 ${d}，库里是 ${t.version}（主版本不同）`);
      else if (t.status === "deprecated") add("warn", "deps", `依赖的 ${did} 已弃用`);
    }
    for (const s of e.styles) if (!ids.has(s)) add("warn", "styles", `风格包不存在：${s}`);
    for (const ref of e.provenance.derived_from) {
      const rid = ref.split("#")[0];
      if (rid.startsWith("reference.") && !ids.has(rid)) add("warn", "provenance", `拆解来源不存在：${rid}`);
    }
    if (e.status === "review" || e.status === "approved") for (const m of readinessProblems(lib, e)) add("error", "readiness", m);
    else for (const m of provenanceProblems(e)) add("warn", "provenance", m);
  }
  return issues;
}
