import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseScript } from "../src/voice.ts";
import { newProject } from "../src/new.ts";
import { briefState, openProject } from "../src/project.ts";
import { check } from "../src/check.ts";
import { positional } from "../src/util.ts";

test("script.md：分段、句子、额外停顿、注释", () => {
  const s = parseScript("# title\n> note\n\nOne. Two!\n\n[pause 1.2]\nThree?\n", { sentence: 0.3, paragraph: 0.75 });
  assert.deepEqual(s.map((x) => x.text), ["One.", "Two!", "Three?"]);
  assert.deepEqual(s.map((x) => x.pauseBefore), [0, 0.3, 0.75 + 1.2]);
  assert.deepEqual(s.map((x) => x.para), [0, 0, 1]);
});

test("中文句子按句号切分", () => {
  const s = parseScript("天是蓝的。可阳光是白的！\n", { sentence: 0.3, paragraph: 0.75 });
  assert.deepEqual(s.map((x) => x.text), ["天是蓝的。", "可阳光是白的！"]);
});

test("新项目：简报模板不通过闸门，填好并确认后通过", async () => {
  const dir = join(mkdtempSync(join(tmpdir(), "vh-t-")), "p");
  newProject(dir, {});
  const pr = openProject(dir);
  assert.equal(briefState(pr).ok, false);
  const sec = (n: string, body: string) => `## ${n}\n${body}\n\n`;
  writeFileSync(pr.paths.brief, "---\nstatus: approved\n---\n" + sec("inputs", "topic") + sec("direction", "Banned: grey frames") + sec("structure", "hook") + sec("build", "kits") + sec("gotchas", "none") + sec("start", "beats first"));
  const r = await check(pr, "brief");
  assert.equal(r.pass, true, JSON.stringify(r.issues));
});

test("模板分镜通过结构校验（只差人工确认）", async () => {
  const dir = join(mkdtempSync(join(tmpdir(), "vh-t-")), "p");
  newProject(dir, {});
  const r = await check(openProject(dir), "storyboard");
  assert.deepEqual(r.issues.filter((i) => i.level === "error").map((i) => i.rule), ["GATE"]);
});

test("参数解析：值参数不被当成位置参数", () => {
  assert.deepEqual(positional(["kits", "show", "kit/title-card", "--json"]), ["kits", "show", "kit/title-card"]);
  assert.deepEqual(positional(["stills", "1,2", "--out", "x", "--json"]), ["stills", "1,2"]);
});
