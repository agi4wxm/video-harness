import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ALL_TYPES, CATEGORIES, CONTENT_BY_MEDIUM, DECISION_TREE, ELEMENT_EXAMPLES, Library, catalog, classifyByAnswers,
  lint, readinessProblems, searchIndex, stats, subtypeOf, suggest, taxonomyMarkdown,
} from "../src/index.ts";

const tmpLib = () => Library.init(mkdtempSync(join(tmpdir(), "lib-")), "test");

test("分类体系：8 大类，小类 id 唯一，每个小类都有例子 / 存储说明 / 审查必填项", () => {
  assert.equal(CATEGORIES.length, 8);
  assert.equal(new Set(ALL_TYPES).size, ALL_TYPES.length);
  for (const c of CATEGORIES) for (const s of c.subtypes) {
    assert.ok(s.examples.length > 0 && s.stores.length > 0 && s.requiredForReview.length > 0, `${c.id}.${s.id}`);
  }
});

test("决策树穷尽：每个大类都有入口；content 的媒介形态覆盖其全部小类", () => {
  const cats = new Set(DECISION_TREE.map((d) => d.yes.category));
  for (const c of CATEGORIES) if (c.id !== "content") assert.ok(cats.has(c.id), c.id);
  const content = CATEGORIES.find((c) => c.id === "content")!;
  assert.deepEqual(new Set(CONTENT_BY_MEDIUM.map((x) => x.subtype)), new Set(content.subtypes.map((s) => s.id)));
  for (const d of DECISION_TREE) {
    const cat = CATEGORIES.find((c) => c.id === d.yes.category)!;
    assert.deepEqual(new Set(d.yes.choose!.map((x) => x.subtype)), new Set(cat.subtypes.map((s) => s.id)), d.id);
  }
});

test("完备性样例：跨题材的真实要素全部能归类，且每个小类至少有一个要素落入", () => {
  for (const e of ELEMENT_EXAMPLES) assert.ok(subtypeOf(e.type), `${e.element} → ${e.type}`);
  const hit = new Set(ELEMENT_EXAMPLES.map((e) => e.type));
  const missing = ALL_TYPES.filter((t) => !hit.has(t));
  assert.deepEqual(missing, [], "这些小类还没有真实要素示例");
  assert.ok(ELEMENT_EXAMPLES.length >= 100);
});

test("按决策树归类", () => {
  assert.equal(classifyByAnswers({ sound: true }, "sfx"), "sound.sfx");
  assert.equal(classifyByAnswers({}, "ui"), "content.ui");
  assert.throws(() => classifyByAnswers({ sound: true }, "ui"));
  assert.ok(suggest("右侧半透明 HUD 面板").some((s) => s.type === "content.ui"));
});

test("存储：新建、blob 去重、状态流转与审查", () => {
  const lib = tmpLib();
  const e = lib.create({ type: "content.vector", slug: "gas-tank", title: "气罐图标", provenance: { kind: "made" } });
  assert.equal(e.id, "content.vector/gas-tank");
  const f = join(lib.root, "x.svg");
  writeFileSync(f, "<svg/>");
  const a = lib.importBlob(f), b = lib.importBlob(f);
  assert.equal(a, b);
  assert.ok(lib.refExists(e.id, a));
  const check = (x: typeof e) => readinessProblems(lib, x);
  assert.throws(() => lib.setStatus(e.id, "review", check), /spec.kind/);
  const p = lib.importLocal(e.id, f, "previews", "p.svg");
  lib.save({ ...lib.require(e.id), summary: "液位可变", previews: [p], spec: { kind: "icon", layers: ["body", "liquid"] } });
  lib.setStatus(e.id, "review", check);
  assert.throws(() => lib.setStatus(e.id, "approved", check), /审查记录/);
  lib.addReview(e.id, { reviewer: "me", verdict: "approve", checklist: {}, notes: "", images: [] });
  const ok = lib.setStatus(e.id, "approved", check);
  assert.equal(ok.status, "approved");
  assert.throws(() => lib.save({ ...ok, title: "改名" }), /bump/);
  const v2 = lib.bump(e.id);
  assert.equal(v2.version, "0.2.0");
  assert.equal(v2.status, "draft");
});

test("校验：缺失依赖、生成素材缺提示词、标识缺限制", () => {
  const lib = tmpLib();
  lib.create({ type: "effect.overlay", slug: "hud", title: "HUD", provenance: { kind: "generated" }, deps: ["content.vector/nope@1"] });
  lib.create({ type: "content.brand", slug: "logo", title: "Logo", provenance: { kind: "user-provided" } });
  const rules = lint(lib).map((i) => `${i.id}:${i.rule}`);
  assert.ok(rules.includes("effect.overlay/hud:deps"));
  assert.ok(rules.includes("effect.overlay/hud:provenance"));
  assert.ok(rules.includes("content.brand/logo:provenance"));
});

test("检索：中文分词，按标题和 spec 命中", () => {
  const lib = tmpLib();
  lib.create({ type: "effect.dataviz", slug: "trajectory-fan", title: "轨迹族展开", summary: "最优解高亮，超标标红", provenance: { kind: "made" }, spec: { runtime: "svg" } });
  lib.create({ type: "content.ui", slug: "side-hud", title: "侧边遥测面板", provenance: { kind: "made" } });
  const s = searchIndex(lib);
  assert.equal(s.search("轨迹")[0]?.id, "effect.dataviz/trajectory-fan");
  assert.equal(s.search("遥测")[0]?.id, "content.ui/side-hud");
  assert.equal(s.search("svg")[0]?.id, "effect.dataviz/trajectory-fan");
  assert.equal(stats(lib).total, 2);
  assert.equal(catalog(lib).length, 2);
});

test("文档生成包含全部小类", () => {
  const md = taxonomyMarkdown();
  for (const t of ALL_TYPES) assert.ok(md.includes(`\`${t}\``), t);
});
