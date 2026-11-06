// 素材库服务（docs/03）：读取 library/index.json，检索、解析引用、按项目锁定版本并复制媒体文件。
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export type Asset = {
  id: string;
  kind: string;
  title: string;
  summary?: string;
  tags?: Record<string, string[]>;
  entry?: string;
  path: string;
  deps?: string[];
  examples?: Array<{ name: string; duration_s?: number; params: Record<string, unknown> }>;
  constraints?: Record<string, unknown>;
  implements?: string[];
  provenance: Record<string, unknown>;
  quality: { status: "draft" | "verified" | "golden" | "deprecated"; uses?: number; p0_rate?: number | null };
  params_json_schema?: unknown;
};

const RANK = { deprecated: -1, draft: 0, verified: 1, golden: 2 } as const;

export class Library {
  constructor(private root: string) {}

  all(): Asset[] {
    const file = join(this.root, "library", "index.json");
    if (!existsSync(file)) throw new Error("library/index.json 不存在，请先在 engine/ 运行 npm run index");
    const raw = readFileSync(file, "utf8");
    return (JSON.parse(raw).assets as Asset[]) ?? [];
  }

  /** 解析引用：kind/name[@x[.y[.z]]] → 匹配版本前缀的最新版本。 */
  resolve(ref: string): Asset {
    const [name, ver] = ref.split("@");
    const cands = this.all().filter((a) => a.id.split("@")[0] === name && (!ver || a.id.split("@")[1].startsWith(ver)));
    if (!cands.length) throw new Error(`素材不存在：${ref}`);
    return cands.sort((a, b) => cmpVer(b.id.split("@")[1], a.id.split("@")[1]))[0];
  }

  search(opts: { q?: string; kind?: string; tags?: Record<string, string>; min_status?: keyof typeof RANK; limit?: number }) {
    const min = RANK[opts.min_status ?? "verified"];
    const q = (opts.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const matched = this.all()
      .filter((a) => !opts.kind || a.kind === opts.kind || a.kind.startsWith(opts.kind + "."))
      .filter((a) => !opts.tags || Object.entries(opts.tags).every(([k, v]) => (a.tags?.[k] ?? []).includes(v)))
      .map((a) => {
        const hay = [a.id, a.title, a.summary, ...Object.values(a.tags ?? {}).flat(), ...(a.implements ?? [])].join(" ").toLowerCase();
        const score = q.length ? q.filter((t) => hay.includes(t)).length / q.length : 1;
        return { a, score };
      })
      .filter((x) => x.score > 0);
    const visible = matched.filter((x) => RANK[x.a.quality.status] >= min);
    const hidden = matched.length - visible.length;
    const scored = visible
      .map((x) => ({ ...x, score: x.score + RANK[x.a.quality.status] * 0.01 }))
      .sort((x, y) => y.score - x.score)
      .slice(0, opts.limit ?? 20);
    const results = scored.map(({ a }) => ({
      id: a.id,
      kind: a.kind,
      title: a.title,
      summary: a.summary,
      tags: a.tags,
      status: a.quality.status,
      examples: (a.examples ?? []).map((e) => e.name),
    }));
    return {
      results,
      ...(hidden ? { hidden_below_min_status: hidden, hint: "还有低于 min_status 的结果被隐藏；如需草稿素材请传 min_status=draft（使用前需人工确认，规范 H13）" } : {}),
    };
  }

  /** 依赖闭包（含自身）。 */
  closure(ids: string[]): Asset[] {
    const seen = new Map<string, Asset>();
    const visit = (ref: string) => {
      const a = this.resolve(ref);
      if (seen.has(a.id)) return;
      seen.set(a.id, a);
      for (const d of a.deps ?? []) visit(d);
    };
    ids.forEach(visit);
    return [...seen.values()];
  }

  /**
   * 把素材引入项目：写入 asset-lock.json（锁定版本），媒体文件复制到 public/assets/<kind>/<name>/。
   * 返回每个媒体素材在分镜中应使用的 src。
   */
  use(projectDir: string, refs: string[], allowDraft: boolean) {
    const assets = this.closure(refs);
    const drafts = assets.filter((a) => a.quality.status === "draft" || a.quality.status === "deprecated");
    if (!allowDraft && drafts.some((a) => a.quality.status === "deprecated")) {
      throw new Error(`包含已弃用素材：${drafts.filter((a) => a.quality.status === "deprecated").map((a) => a.id).join(", ")}`);
    }
    const lockFile = join(projectDir, "asset-lock.json");
    const lock: { assets: Record<string, { id: string; status: string; src?: string }> } = existsSync(lockFile)
      ? JSON.parse(readFileSync(lockFile, "utf8"))
      : { assets: {} };
    const out: Array<{ id: string; status: string; src?: string }> = [];
    for (const a of assets) {
      const entry: { id: string; status: string; src?: string } = { id: a.id, status: a.quality.status };
      if (a.kind.startsWith("media.") && a.entry && !a.entry.startsWith("npm:")) {
        const name = a.id.split("@")[0];
        const rel = join("assets", name, basename(a.entry));
        const dst = join(projectDir, "public", rel);
        mkdirSync(dirname(dst), { recursive: true });
        copyFileSync(join(this.root, a.path, a.entry), dst);
        entry.src = rel;
      }
      lock.assets[a.id.split("@")[0]] = entry;
      out.push(entry);
    }
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(lockFile, JSON.stringify(lock, null, 2));
    return { locked: out, drafts: drafts.map((a) => a.id) };
  }
}

/** 收集分镜中引用的全部素材 id。 */
export function storyboardRefs(sb: any): string[] {
  const refs = new Set<string>();
  if (sb.style) refs.add(sb.style);
  if (sb.motion) refs.add(sb.motion);
  refs.add(sb.template?.id ?? "element/window-frame");
  for (const s of sb.shots ?? []) refs.add(s.block);
  for (const t of sb.transitions ?? []) refs.add(t.asset);
  for (const s of sb.shots ?? []) {
    const src = s.params?.src;
    const m = typeof src === "string" ? /^assets\/([a-z0-9.]+\/[a-z0-9-]+)\//.exec(src) : null;
    if (m) refs.add(m[1]);
  }
  return [...refs];
}

function cmpVer(a: string, b: string): number {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}
