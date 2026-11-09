// 本地 HTTP API：桌面应用（Electron）和浏览器调试共用。只监听 127.0.0.1。
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { classifyByAnswers, suggest } from "./classify.ts";
import { ELEMENT_EXAMPLES } from "./elements.ts";
import { catalog, graph, searchIndex, stats, writeIndex, type CatalogItem } from "./indexer.ts";
import { lint, readinessProblems } from "./lint.ts";
import { checklistFor, Entry, STATUSES, type Status } from "./schema.ts";
import { Library, LibraryError } from "./store.ts";
import { CATEGORIES, CONTENT_BY_MEDIUM, DECISION_TREE } from "./taxonomy.ts";

const MIME: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".avif": "image/avif",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".ogg": "audio/ogg",
  ".json": "application/json", ".yaml": "text/yaml; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".pdf": "application/pdf", ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf", ".ico": "image/x-icon",
};

export interface ServeOptions { root: string; port?: number; uiDir?: string; reviewer?: string }

function send(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function body(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const s = Buffer.concat(chunks).toString("utf8");
  return s ? JSON.parse(s) : {};
}

function streamFile(req: IncomingMessage, res: ServerResponse, path: string) {
  if (!existsSync(path) || !statSync(path).isFile()) return send(res, 404, { error: "文件不存在" });
  const size = statSync(path).size;
  const type = MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m && m[1] ? Number(m[1]) : 0;
    const end = m && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    res.writeHead(206, { "content-type": type, "content-range": `bytes ${start}-${end}/${size}`, "accept-ranges": "bytes", "content-length": end - start + 1 });
    createReadStream(path, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { "content-type": type, "content-length": size, "accept-ranges": "bytes", "cache-control": "max-age=60" });
  createReadStream(path).pipe(res);
}

export function filterCatalog(items: CatalogItem[], q: URLSearchParams, search: (s: string) => Array<{ id: string; score: number }>): CatalogItem[] {
  let out = items;
  const query = q.get("q")?.trim();
  if (query) {
    const hits = search(query);
    const rank = new Map(hits.map((h, i) => [h.id, i]));
    out = out.filter((x) => rank.has(x.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  }
  for (const k of ["category", "type", "status", "provenance"] as const) {
    const v = q.get(k);
    if (v) out = out.filter((x) => (x as any)[k] === v);
  }
  const style = q.get("style");
  if (style) out = out.filter((x) => x.styles.includes(style) || x.id === style);
  const ref = q.get("reference");
  if (ref) out = out.filter((x) => x.derived_from.some((d) => d.startsWith(ref)));
  if (!query) {
    const sort = q.get("sort") ?? "updated";
    out = [...out].sort((a, b) => (sort === "title" ? a.title.localeCompare(b.title, "zh") : sort === "type" ? a.type.localeCompare(b.type) : b.updated.localeCompare(a.updated) || a.id.localeCompare(b.id)));
  }
  return out;
}

export function startServer(opts: ServeOptions): Promise<{ server: Server; port: number; url: string }> {
  let lib = Library.open(opts.root);
  const reload = () => { lib = Library.open(opts.root); return lib; };
  let idx = searchIndex(lib);
  const reindex = () => { lib.invalidate(); lib.entries(); idx = searchIndex(lib); };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const p = url.pathname;
      if (p === "/api/library") {
        lib.entries();
        return send(res, 200, { meta: lib.meta, root: lib.root, stats: stats(lib), loadIssues: lib.loadIssues });
      }
      if (p === "/api/taxonomy") return send(res, 200, { categories: CATEGORIES, decisionTree: DECISION_TREE, contentByMedium: CONTENT_BY_MEDIUM, elements: ELEMENT_EXAMPLES });
      if (p === "/api/entries" && req.method === "GET") return send(res, 200, filterCatalog(catalog(lib), url.searchParams, idx.search));
      if (p === "/api/entries" && req.method === "POST") {
        const b = await body(req);
        const e = lib.create(b);
        reindex();
        return send(res, 201, e);
      }
      if (p === "/api/lint") return send(res, 200, lint(lib));
      if (p === "/api/graph") return send(res, 200, graph(lib));
      if (p === "/api/reindex" && req.method === "POST") { reload(); reindex(); writeIndex(lib); return send(res, 200, { ok: true, stats: stats(lib) }); }
      if (p === "/api/classify" && req.method === "POST") {
        const b = await body(req);
        if (b.answers) return send(res, 200, { type: classifyByAnswers(b.answers, b.pick) });
        return send(res, 200, suggest(String(b.text ?? "")));
      }
      const fm = /^\/api\/file\/(.+)$/.exec(p);
      if (fm) {
        const id = decodeURIComponent(fm[1]);
        const ref = url.searchParams.get("ref") ?? "";
        const e = lib.require(id);
        const allowed = [...Object.values(e.files), ...e.previews, ...(e.cover ? [e.cover] : [])];
        const inEntry = !ref.startsWith("blob:") && normalize(join(lib.dirOf(id), ref)).startsWith(lib.dirOf(id));
        if (!allowed.includes(ref) && !inEntry) return send(res, 403, { error: "不是这条素材的文件" });
        return streamFile(req, res, lib.resolveRef(id, ref));
      }
      const em = /^\/api\/entries\/([^/]+)(?:\/(review|status|bump))?$/.exec(p);
      if (em) {
        const id = decodeURIComponent(em[1]);
        const action = em[2];
        if (!action && req.method === "GET") {
          const e = lib.require(id);
          const all = lib.entries();
          return send(res, 200, {
            entry: e,
            reviews: lib.reviews(id),
            checklist: checklistFor(e.type),
            readiness: readinessProblems(lib, e),
            lint: lint(lib, [id]),
            dependents: all.filter((x) => x.deps.some((d) => d.split("@")[0] === id) || x.styles.includes(id)).map((x) => ({ id: x.id, title: x.title, type: x.type })),
            derived: all.filter((x) => x.provenance.derived_from.some((d) => d.split("#")[0] === id)).map((x) => ({ id: x.id, title: x.title, type: x.type, status: x.status, cover: lib.cover(x), at: x.provenance.derived_from.find((d) => d.startsWith(id))?.split("#")[1] ?? null })),
            files: Object.fromEntries([...Object.entries(e.files), ...e.previews.map((r, i) => [`preview${i}`, r])].map(([k, r]) => [k, { ref: r, exists: lib.refExists(id, r as string), size: lib.fileSize(id, r as string) }])),
          });
        }
        if (!action && req.method === "PATCH") {
          const b = await body(req);
          const cur = lib.require(id);
          const allowedKeys = ["title", "summary", "tags", "spec", "notes", "styles", "deps"];
          const next: any = { ...cur };
          for (const k of allowedKeys) if (k in b) next[k] = b[k];
          if (typeof b.rating === "number") next.usage = { ...cur.usage, rating: b.rating };
          const saved = lib.save(Entry.parse(next));
          reindex();
          return send(res, 200, saved);
        }
        if (action === "review" && req.method === "POST") {
          const b = await body(req);
          const r = lib.addReview(id, { reviewer: b.reviewer ?? opts.reviewer ?? "me", verdict: b.verdict, checklist: b.checklist ?? {}, notes: b.notes ?? "", images: [] });
          let entry = lib.require(id);
          if (b.verdict === "approve" && entry.status === "review") entry = lib.setStatus(id, "approved", (x) => readinessProblems(lib, x));
          if (b.verdict === "reject" && entry.status === "review") entry = lib.setStatus(id, "draft", () => []);
          reindex();
          return send(res, 200, { review: r, entry });
        }
        if (action === "status" && req.method === "POST") {
          const b = await body(req);
          if (!STATUSES.includes(b.status)) return send(res, 400, { error: "未知状态" });
          const e = lib.setStatus(id, b.status as Status, (x) => readinessProblems(lib, x));
          reindex();
          return send(res, 200, e);
        }
        if (action === "bump" && req.method === "POST") { const e = lib.bump(id, (await body(req)).part ?? "minor"); reindex(); return send(res, 200, e); }
      }
      if (p.startsWith("/api/")) return send(res, 404, { error: "未知接口" });
      // 静态界面
      if (opts.uiDir) {
        const file = normalize(join(opts.uiDir, p === "/" ? "index.html" : p));
        if (file.startsWith(resolve(opts.uiDir)) && existsSync(file) && statSync(file).isFile()) return streamFile(req, res, file);
        const index = join(opts.uiDir, "index.html");
        if (existsSync(index)) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(readFileSync(index)); }
      }
      send(res, 404, { error: "not found" });
    } catch (err) {
      const e = err as Error;
      send(res, e instanceof LibraryError ? 400 : 500, { error: e.message });
    }
  });
  return new Promise((ok, bad) => {
    server.once("error", bad);
    server.listen(opts.port ?? 0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      ok({ server, port, url: `http://127.0.0.1:${port}` });
    });
  });
}
