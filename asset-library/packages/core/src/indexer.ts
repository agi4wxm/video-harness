// 索引：目录（catalog）、关系图（依赖 / 来源 / 使用）、统计、全文检索。
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import MiniSearch from "minisearch";
import type { Library } from "./store.ts";
import type { EntryT, Status } from "./schema.ts";
import { ALL_TYPES, CATEGORIES } from "./taxonomy.ts";

export interface CatalogItem {
  id: string; type: string; category: string; subtype: string; title: string; summary: string; status: Status; version: string;
  tags: Record<string, string[]>; styles: string[]; provenance: string; cover: string | null; previews: number; deps: string[];
  derived_from: string[]; updated: string; rating?: number; uses: number;
  /** 色板类条目的颜色（卡片直接画色块） */
  swatches: string[];
}

export interface Graph { nodes: Array<{ id: string; type: string; title: string }>; edges: Array<{ from: string; to: string; kind: "dep" | "style" | "derived" }> }

export function catalog(lib: Library): CatalogItem[] {
  return lib.entries().map((e) => {
    const [category, subtype] = e.type.split(".");
    return {
      id: e.id, type: e.type, category, subtype, title: e.title, summary: e.summary, status: e.status, version: e.version,
      tags: e.tags, styles: e.styles, provenance: e.provenance.kind, cover: lib.cover(e), previews: e.previews.length, deps: e.deps,
      derived_from: e.provenance.derived_from, updated: e.updated, rating: e.usage.rating, uses: e.usage.count,
      swatches: Array.isArray(e.spec.colors) ? (e.spec.colors as Array<{ hex?: string }>).map((c) => c.hex).filter((h): h is string => typeof h === "string") : [],
    };
  });
}

export function graph(lib: Library): Graph {
  const es = lib.entries();
  const g: Graph = { nodes: es.map((e) => ({ id: e.id, type: e.type, title: e.title })), edges: [] };
  for (const e of es) {
    for (const d of e.deps) g.edges.push({ from: e.id, to: d.split("@")[0], kind: "dep" });
    for (const s of e.styles) g.edges.push({ from: e.id, to: s, kind: "style" });
    for (const r of e.provenance.derived_from) if (r.startsWith("reference.")) g.edges.push({ from: e.id, to: r.split("#")[0], kind: "derived" });
  }
  return g;
}

export function stats(lib: Library) {
  const es = lib.entries();
  const byType = Object.fromEntries(ALL_TYPES.map((t) => [t, 0])) as Record<string, number>;
  const byStatus: Record<string, number> = { draft: 0, review: 0, approved: 0, deprecated: 0 };
  for (const e of es) { byType[e.type]++; byStatus[e.status]++; }
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.subtypes.reduce((n, s) => n + byType[`${c.id}.${s.id}`], 0)]));
  return { total: es.length, byType, byCategory, byStatus };
}

function flatText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(flatText).join(" ");
  if (typeof v === "object") return Object.entries(v as object).map(([k, x]) => `${k} ${flatText(x)}`).join(" ");
  return "";
}

// 中文没有空格分词：按单字 + 相邻双字切分，英文按词
function tokenize(s: string): string[] {
  const out: string[] = [];
  for (const part of s.toLowerCase().split(/[\s,.;:!?，。；：！？、()（）\[\]{}"'“”‘’/\\|<>=+*#@&^%$~`-]+/)) {
    if (!part) continue;
    if (/[㐀-鿿]/.test(part)) {
      const chars = [...part];
      chars.forEach((c, i) => { out.push(c); if (i + 1 < chars.length) out.push(c + chars[i + 1]); });
    } else out.push(part);
  }
  return out;
}

export function searchIndex(lib: Library) {
  const ms = new MiniSearch<{ id: string; title: string; summary: string; tags: string; spec: string; type: string }>({
    fields: ["title", "summary", "tags", "spec", "type"],
    storeFields: ["id"],
    tokenize,
    searchOptions: { boost: { title: 3, tags: 2, summary: 1.5 }, prefix: true, fuzzy: 0.15, combineWith: "AND" },
  });
  ms.addAll(lib.entries().map((e: EntryT) => ({ id: e.id, title: e.title, summary: e.summary, tags: flatText(e.tags) + " " + e.styles.join(" "), spec: flatText(e.spec), type: e.type })));
  return { search: (q: string) => ms.search(q).map((r) => ({ id: r.id as string, score: r.score })) };
}

/** 写出 index/ 目录（给外部工具和快速加载用） */
export function writeIndex(lib: Library) {
  const dir = join(lib.root, "index");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "catalog.json"), JSON.stringify(catalog(lib), null, 1));
  writeFileSync(join(dir, "graph.json"), JSON.stringify(graph(lib), null, 1));
  writeFileSync(join(dir, "stats.json"), JSON.stringify(stats(lib), null, 1));
  return dir;
}
