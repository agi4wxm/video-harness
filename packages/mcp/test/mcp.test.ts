import { test } from "node:test";
import assert from "node:assert/strict";
import { vh } from "../src/vh.ts";

test("MCP 适配器透传 vh 的 JSON 输出", async () => {
  const r = await vh(["kits"]);
  assert.equal(r.code, 0);
  assert.ok(Array.isArray(r.json));
  assert.ok(r.json.some((k: { id: string }) => k.id === "kit/title-card"));
});
