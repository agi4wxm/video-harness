// 与本地素材库 API 通信。地址来自 ?api=（Electron 主进程传入），否则同源（lib serve / vite 代理）。
import type { CatalogItem, Category, DecisionNode, EntryT, LintIssue, ReviewT } from "@asset-library/core";

export type { CatalogItem, Category, DecisionNode, EntryT, LintIssue, ReviewT };

const base = new URLSearchParams(location.search).get("api") ?? "";

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(base + path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? r.statusText);
  return data as T;
}

export interface LibraryInfo {
  meta: { name: string; description: string };
  root: string;
  stats: { total: number; byType: Record<string, number>; byCategory: Record<string, number>; byStatus: Record<string, number> };
  loadIssues: Array<{ path: string; message: string }>;
}
export interface Taxonomy {
  categories: Category[];
  decisionTree: DecisionNode[];
  contentByMedium: Array<{ subtype: string; when: string }>;
  elements: Array<{ element: string; genre: string; type: string }>;
}
export interface EntryDetail {
  entry: EntryT;
  reviews: ReviewT[];
  checklist: string[];
  readiness: string[];
  lint: LintIssue[];
  dependents: Array<{ id: string; title: string; type: string }>;
  derived: Array<{ id: string; title: string; type: string; status: string; cover: string | null; at: string | null }>;
  files: Record<string, { ref: string; exists: boolean; size: number | null }>;
}

export const api = {
  library: () => j<LibraryInfo>("/api/library"),
  taxonomy: () => j<Taxonomy>("/api/taxonomy"),
  entries: (q: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]);
    return j<CatalogItem[]>(`/api/entries?${p}`);
  },
  entry: (id: string) => j<EntryDetail>(`/api/entries/${encodeURIComponent(id)}`),
  patch: (id: string, body: Partial<EntryT> & { rating?: number }) => j<EntryT>(`/api/entries/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }),
  status: (id: string, status: string) => j<EntryT>(`/api/entries/${encodeURIComponent(id)}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  review: (id: string, body: { verdict: string; notes: string; checklist: Record<string, string> }) => j<{ entry: EntryT }>(`/api/entries/${encodeURIComponent(id)}/review`, { method: "POST", body: JSON.stringify(body) }),
  bump: (id: string) => j<EntryT>(`/api/entries/${encodeURIComponent(id)}/bump`, { method: "POST", body: "{}" }),
  create: (body: Record<string, unknown>) => j<EntryT>("/api/entries", { method: "POST", body: JSON.stringify(body) }),
  lint: () => j<LintIssue[]>("/api/lint"),
  suggest: (text: string) => j<Array<{ type: string; name: string; category: string }>>("/api/classify", { method: "POST", body: JSON.stringify({ text }) }),
  reindex: () => j<{ ok: boolean }>("/api/reindex", { method: "POST", body: "{}" }),
  fileUrl: (id: string, ref: string) => `${base}/api/file/${encodeURIComponent(id)}?ref=${encodeURIComponent(ref)}`,
};

declare global {
  interface Window {
    desktop?: { platform: string; chooseLibrary: () => Promise<string | null>; info: () => Promise<{ apiBase: string; root: string; recent: string[] }>; reveal: (rel: string) => Promise<void>; openRecent: (root: string) => Promise<void> };
  }
}
