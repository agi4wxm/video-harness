import { test } from "node:test";
import assert from "node:assert/strict";
import { KITS, PACKS, Storyboard, cubicBezier, inspect, layoutChecks, spring, validateStoryboard, keyframes, blink, type EvalEnv } from "../src/index.ts";

const env = (shots: unknown[], extra: Record<string, unknown> = {}): EvalEnv => ({
  W: 1920, H: 1080, fps: 30, pack: PACKS.illustrated,
  storyboard: Storyboard.parse({ version: 2, shots, ...extra }),
});

test("cubic-bezier 与 CSS 端点一致，且单调", () => {
  const f = cubicBezier(0.22, 1, 0.36, 1);
  assert.equal(f(0), 0);
  assert.equal(f(1), 1);
  let prev = 0;
  for (let x = 0; x <= 1; x += 0.05) { const y = f(x); assert.ok(y >= prev - 1e-9); prev = y; }
});

test("弹簧闭式解收敛到 1，有过冲", () => {
  const c = { stiffness: 170, damping: 14, mass: 1 };
  assert.ok(Math.abs(spring(3, c) - 1) < 1e-3);
  assert.ok(Math.max(...Array.from({ length: 60 }, (_, i) => spring(i / 60, c))) > 1);
});

test("关键帧与眨眼都是 t 的纯函数", () => {
  const k = [{ at: 0, x: 0 }, { at: 1, x: 10 }];
  assert.equal(keyframes(0.5, k).x, keyframes(0.5, k).x);
  assert.equal(keyframes(2, k).x, 10);
  const a = Array.from({ length: 100 }, (_, i) => blink(i * 0.1, 3.4, 7));
  const b = Array.from({ length: 100 }, (_, i) => blink(i * 0.1, 3.4, 7)).reverse().reverse();
  assert.deepEqual(a, b);
  assert.ok(a.some((v) => v > 0));
});

for (const kit of Object.values(KITS)) {
  for (const ex of kit.examples) {
    test(`${kit.id} 示例「${ex.name}」能求值且通过版面校验`, () => {
      const e = env([{ id: "s1", start: 0, end: ex.duration, scene: { kind: "kit", kit: kit.id, params: ex.params }, beats: [{ t: 0, idea: "example" }] }]);
      const sb = validateStoryboard(e, null).filter((i) => i.level === "error");
      assert.deepEqual(sb, []);
      const samples = inspect(e, 0.1);
      assert.ok(samples.length > 0);
      // 同一时刻求值两次结果一致（确定性）
      assert.deepEqual(inspect(e, 0.5), inspect(e, 0.5));
      const errs = layoutChecks(e, samples).filter((i) => i.level === "error");
      assert.deepEqual(errs, [], JSON.stringify(errs, null, 1));
    });
  }
}

test("分镜校验能发现空隙、hex 颜色和缺失的语义色", () => {
  const e = env([
    { id: "a", start: 0, end: 2, scene: { kind: "kit", kit: "kit/title-card", params: { title: "Hi", color: "#ff0000" } }, beats: [{ t: 0, idea: "title" }] },
    { id: "b", start: 2.5, end: 5, scene: { kind: "kit", kit: "kit/stat-crowd", params: { to: 0.5, highlight: "drug" } }, beats: [{ t: 2.5, idea: "crowd" }] },
  ]);
  const rules = validateStoryboard(e, null).map((i) => i.rule);
  assert.ok(rules.includes("H11"));
  assert.ok(rules.includes("H3"));
  assert.ok(rules.includes("SB-kit"));
});

test("语义色 token 可用", () => {
  const e = env([{ id: "a", start: 0, end: 4, scene: { kind: "kit", kit: "kit/stat-crowd", params: { to: 0.5, highlight: "drug" } }, beats: [{ t: 0, idea: "crowd" }] }], { semantic: { drug: "#57D88C" } });
  assert.deepEqual(validateStoryboard(e, null).filter((i) => i.level === "error"), []);
});
