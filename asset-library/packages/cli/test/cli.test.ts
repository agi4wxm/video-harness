import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../src/main.ts";

test("init → add → import → status → review → approved", async () => {
  const root = join(mkdtempSync(join(tmpdir(), "cli-")), "lib");
  assert.equal(await main(["init", root, "--name", "t"]), 0);
  assert.equal(await main(["add", "sound.sfx", "impact", "--title", "撞击", "--summary", "低频撞击", "--root", root]), 0);
  const f = join(root, "impact.wav");
  writeFileSync(f, "RIFF");
  assert.equal(await main(["import", "sound.sfx/impact", f, "--as", "preview", "--root", root]), 0);
  assert.equal(await main(["status", "sound.sfx/impact", "review", "--root", root]), 2); // spec 未填
  const { Library } = await import("@asset-library/core");
  const lib = Library.open(root);
  lib.save({ ...lib.require("sound.sfx/impact"), spec: { category: "impact", onset_ms: 12 } });
  assert.equal(await main(["status", "sound.sfx/impact", "review", "--root", root]), 0);
  assert.equal(await main(["review", "sound.sfx/impact", "--verdict", "approve", "--root", root]), 0);
  assert.equal(Library.open(root).require("sound.sfx/impact").status, "approved");
  assert.equal(await main(["lint", "--root", root]), 0);
});
