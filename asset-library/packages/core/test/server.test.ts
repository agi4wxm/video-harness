import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Library, startServer } from "../src/index.ts";

test("本地 API：目录、详情、文件、审查流程", async () => {
  const lib = Library.init(mkdtempSync(join(tmpdir(), "srv-")), "t");
  const e = lib.create({ type: "content.image", slug: "rocket", title: "火箭着陆", summary: "生成图", provenance: { kind: "generated", generator: { model: "gpt-image-1", prompt: "rocket landing at dusk" } }, spec: { kind: "generated", dimensions: "1920x1080" } });
  const png = join(lib.root, "p.png");
  writeFileSync(png, Buffer.from("89504e470d0a1a0a", "hex"));
  const ref = lib.importBlob(png);
  lib.save({ ...lib.require(e.id), previews: [ref] });
  const { server, url } = await startServer({ root: lib.root });
  try {
    const j = async (p: string, init?: RequestInit) => { const r = await fetch(url + p, init); return { status: r.status, body: await r.json() }; };
    assert.equal((await j("/api/library")).body.stats.total, 1);
    assert.equal((await j("/api/entries?q=火箭")).body[0].id, e.id);
    assert.equal((await j("/api/entries?category=sound")).body.length, 0);
    const d = await j(`/api/entries/${encodeURIComponent(e.id)}`);
    assert.deepEqual(d.body.readiness, []);
    const f = await fetch(`${url}/api/file/${encodeURIComponent(e.id)}?ref=${encodeURIComponent(ref)}`);
    assert.equal(f.headers.get("content-type"), "image/png");
    assert.equal((await fetch(`${url}/api/file/${encodeURIComponent(e.id)}?ref=../../library.yaml`)).status, 403);
    const post = (p: string, b: unknown) => j(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
    assert.equal((await post(`/api/entries/${encodeURIComponent(e.id)}/status`, { status: "review" })).status, 200);
    const r = await post(`/api/entries/${encodeURIComponent(e.id)}/review`, { verdict: "approve", notes: "ok", checklist: {} });
    assert.equal(r.body.entry.status, "approved");
    assert.equal((await j(`/api/entries/${encodeURIComponent(e.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "改" }) })).status, 400);
  } finally { server.close(); }
});
