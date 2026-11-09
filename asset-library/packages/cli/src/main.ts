// lib：素材库命令行。所有写操作都经过 core 的校验与状态规则。
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATEGORIES, CONTENT_BY_MEDIUM, DECISION_TREE, Library, LibraryError, STATUS_LABEL, catalog, checklistFor, classifyByAnswers,
  lint, readinessProblems, searchIndex, startServer, stats, subtypeOf, suggest, taxonomyMarkdown, writeIndex, type Status,
} from "@asset-library/core";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, "..", "..", "..", "library");

const HELP = `lib —— 素材库命令行

  lib init <dir> --name <名称>                 新建素材库
  lib types                                    列出全部类型（8 大类 · 47 小类）
  lib classify [描述]                          归类：给描述则按关键词建议；不给则走决策树问答
  lib add <type> <slug> --title <标题> [--summary …] [--kind made|decomposed|generated|licensed|user-provided]
  lib import <id> <文件> [--as preview|cover|file:<角色>] [--blob]   导入文件（大文件用 --blob 放进 blobs/）
  lib ls [--type t] [--category c] [--status s] [--style id]
  lib show <id>
  lib search <关键词>
  lib lint                                     校验全部条目
  lib index                                    重建 index/（目录、关系图、统计）
  lib status <id> <draft|review|approved|deprecated>
  lib review <id> --verdict approve|reject|comment [--reviewer 名字] [--notes …] [--check "条目=pass"]...
  lib bump <id> [major|minor|patch]            已通过的条目要修改时升版本（回到草稿）
  lib docs [--out docs/taxonomy.md]            由分类体系生成文档
  lib serve [--port 4580] [--ui <dist 目录>]   启动本地 API（桌面应用 / 浏览器用）

通用：--root <素材库目录>（默认环境变量 ASSET_LIBRARY，或仓库内 library/），--json 输出 JSON`;

function args(argv: string[]) {
  const pos: string[] = [], opt: Record<string, string | true> = {}, multi: Record<string, string[]> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      opt[k] = v;
      (multi[k] ??= []).push(String(v));
    } else pos.push(a);
  }
  return { pos, opt, multi };
}

function findRoot(opt: Record<string, string | true>): string {
  if (typeof opt.root === "string") return resolve(opt.root);
  if (process.env.ASSET_LIBRARY) return resolve(process.env.ASSET_LIBRARY);
  let d = process.cwd();
  for (;;) {
    if (existsSync(join(d, "library.yaml"))) return d;
    if (existsSync(join(d, "library", "library.yaml"))) return join(d, "library");
    const up = dirname(d);
    if (up === d) return DEFAULT_ROOT;
    d = up;
  }
}

const pad = (s: string, n: number) => s + " ".repeat(Math.max(1, n - [...s].reduce((w, c) => w + (/[　-鿿＀-￯]/.test(c) ? 2 : 1), 0)));

async function wizard(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answers: Record<string, boolean> = {};
    for (const n of DECISION_TREE) {
      const a = (await rl.question(`\n${n.question}\n  （${n.hint}）\n  [y/N] `)).trim().toLowerCase();
      if (a === "y" || a === "yes" || a === "是") {
        answers[n.id] = true;
        const ch = n.yes.choose!;
        ch.forEach((c, i) => console.log(`  ${i + 1}. ${c.subtype} —— ${c.when}`));
        const k = Number(await rl.question("  选择小类编号："));
        return classifyByAnswers(answers, ch[Math.max(0, k - 1)].subtype);
      }
    }
    console.log("\n以上全否：它是画面里出现的「东西」。按媒介形态选：");
    CONTENT_BY_MEDIUM.forEach((c, i) => console.log(`  ${i + 1}. ${c.subtype} —— ${c.when}`));
    const k = Number(await rl.question("  选择小类编号："));
    return classifyByAnswers(answers, CONTENT_BY_MEDIUM[Math.max(0, k - 1)].subtype);
  } finally { rl.close(); }
}

export async function main(argv: string[]): Promise<number> {
  const { pos, opt, multi } = args(argv);
  const [cmd, a1, a2] = pos;
  const json = opt.json === true;
  const out = (human: string, data: unknown) => console.log(json ? JSON.stringify(data, null, 2) : human);
  try {
    if (!cmd || cmd === "help" || opt.help) { console.log(HELP); return 0; }
    if (cmd === "init") {
      if (!a1) throw new LibraryError("用法：lib init <dir> --name <名称>");
      const lib = Library.init(a1, typeof opt.name === "string" ? opt.name : "素材库");
      out(`✓ 已创建素材库：${lib.root}`, { root: lib.root });
      return 0;
    }
    if (cmd === "types") {
      const lines = CATEGORIES.flatMap((c) => [`\n${c.name}  ${c.id}  —— ${c.description}`, ...c.subtypes.map((s) => `  ${pad(`${c.id}.${s.id}`, 28)}${s.name}：${s.description}`)]);
      out(lines.join("\n"), CATEGORIES);
      return 0;
    }
    if (cmd === "docs") {
      const md = taxonomyMarkdown();
      const f = typeof opt.out === "string" ? resolve(opt.out) : null;
      if (f) { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, md); out(`✓ 已写入 ${f}`, { file: f }); }
      else console.log(md);
      return 0;
    }
    if (cmd === "classify") {
      const text = pos.slice(1).join(" ");
      if (text) {
        const s = suggest(text);
        out(s.length ? s.map((x) => `→ ${x.type}  ${x.name}`).join("\n") + "\n（关键词建议；不确定时运行 lib classify 走决策树）" : "没有关键词命中，运行 lib classify（不带参数）走决策树问答。", s);
      } else {
        const t = await wizard();
        const st = subtypeOf(t)!;
        out(`\n→ ${t}  ${st.category.name} · ${st.subtype.name}\n  存储：${st.subtype.stores.join("；")}`, { type: t });
      }
      return 0;
    }
    const root = findRoot(opt);
    if (cmd === "serve") {
      const ui = typeof opt.ui === "string" ? resolve(opt.ui) : resolve(HERE, "..", "..", "..", "apps", "desktop", "dist", "renderer");
      const { url } = await startServer({ root, port: Number(opt.port ?? 4580), uiDir: existsSync(ui) ? ui : undefined });
      console.log(`素材库 ${root}\nAPI   ${url}/api/library${existsSync(ui) ? `\n界面  ${url}/` : "\n（未找到界面构建产物，只提供 API）"}`);
      await new Promise(() => {});
    }
    const lib = Library.open(root);
    switch (cmd) {
      case "add": {
        if (!a1 || !a2) throw new LibraryError("用法：lib add <type> <slug> --title <标题>");
        if (typeof opt.title !== "string") throw new LibraryError("需要 --title");
        const e = lib.create({ type: a1, slug: a2, title: opt.title, summary: typeof opt.summary === "string" ? opt.summary : "", provenance: { kind: (typeof opt.kind === "string" ? opt.kind : "made") as any } });
        const st = subtypeOf(e.type)!;
        out(`✓ 已新建草稿 ${e.id}\n  目录：${lib.dirOf(e.id)}\n  提交审查前需要：${st.subtype.requiredForReview.map((k) => `spec.${k}`).join("、")}、至少一个预览、summary`, e);
        return 0;
      }
      case "import": {
        if (!a1 || !a2) throw new LibraryError("用法：lib import <id> <文件>");
        const e = lib.require(a1);
        const as = typeof opt.as === "string" ? opt.as : "file:main";
        const ref = opt.blob ? lib.importBlob(a2) : lib.importLocal(e.id, a2, as.startsWith("file:") ? "files" : "previews");
        const next = { ...e };
        if (as === "preview") next.previews = [...e.previews, ref];
        else if (as === "cover") { next.cover = ref; if (!e.previews.includes(ref)) next.previews = [ref, ...e.previews]; }
        else next.files = { ...e.files, [as.slice(5) || "main"]: ref };
        lib.save(next);
        out(`✓ ${a2} → ${ref}`, { ref });
        return 0;
      }
      case "ls": {
        let items = catalog(lib);
        for (const k of ["type", "category", "status"] as const) if (typeof opt[k] === "string") items = items.filter((x) => x[k] === opt[k]);
        if (typeof opt.style === "string") items = items.filter((x) => x.styles.includes(opt.style as string));
        out(items.map((x) => `${pad(STATUS_LABEL[x.status], 8)}${pad(x.id, 46)}${x.title}`).join("\n") + `\n共 ${items.length} 条`, items);
        return 0;
      }
      case "show": {
        const e = lib.require(a1);
        const st = subtypeOf(e.type)!;
        const rv = lib.reviews(e.id);
        const ready = readinessProblems(lib, e);
        out([
          `${e.title}  (${e.id}@${e.version})`, `${st.category.name} · ${st.subtype.name} · ${STATUS_LABEL[e.status]} · 来源：${e.provenance.kind}`,
          e.summary && `\n${e.summary}`,
          `\n文件：${Object.entries(e.files).map(([k, v]) => `${k}=${v}`).join("，") || "无"}`,
          `预览：${e.previews.length} 个`, `依赖：${e.deps.join("，") || "无"}`, `风格：${e.styles.join("，") || "无"}`,
          `spec：${JSON.stringify(e.spec, null, 2)}`,
          `审查：${rv.length ? rv.map((r) => `${r.date.slice(0, 10)} ${r.reviewer} ${r.verdict}`).join("；") : "无"}`,
          ready.length ? `\n提交审查还缺：\n- ${ready.join("\n- ")}` : "\n✓ 满足提交审查条件",
          `\n审查清单：\n- ${checklistFor(e.type).join("\n- ")}`,
        ].filter(Boolean).join("\n"), { entry: e, reviews: rv, readiness: ready });
        return 0;
      }
      case "search": {
        const q = pos.slice(1).join(" ");
        const hits = searchIndex(lib).search(q).slice(0, 30);
        out(hits.map((h) => `${pad(h.id, 46)}${lib.get(h.id)?.title}`).join("\n") || "没有结果", hits);
        return 0;
      }
      case "lint": {
        const issues = lint(lib);
        const err = issues.filter((i) => i.level === "error").length;
        out(issues.map((i) => `${i.level === "error" ? "✗" : "!"} ${pad(i.id, 44)}[${i.rule}] ${i.message}`).join("\n") + `\n${lib.entries().length} 条 · ${err} error · ${issues.length - err} warn\nLIB_LINT=${err ? "FAIL" : "PASS"}`, issues);
        return err ? 1 : 0;
      }
      case "index": {
        const dir = writeIndex(lib);
        const s = stats(lib);
        out(`✓ 索引已写入 ${dir}\n共 ${s.total} 条：${Object.entries(s.byCategory).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join("，")}`, s);
        return 0;
      }
      case "status": {
        const e = lib.setStatus(a1, a2 as Status, (x) => readinessProblems(lib, x));
        out(`✓ ${e.id} → ${STATUS_LABEL[e.status]}`, e);
        return 0;
      }
      case "review": {
        const v = opt.verdict;
        if (v !== "approve" && v !== "reject" && v !== "comment") throw new LibraryError("需要 --verdict approve|reject|comment");
        const checklist = Object.fromEntries((multi.check ?? []).map((c) => { const [k, r] = c.split("="); return [k, (r ?? "pass") as "pass" | "fail" | "n/a"]; }));
        const r = lib.addReview(a1, { reviewer: typeof opt.reviewer === "string" ? opt.reviewer : process.env.USER ?? "me", verdict: v, notes: typeof opt.notes === "string" ? opt.notes : "", checklist, images: [] });
        let e = lib.require(a1);
        if (v === "approve" && e.status === "review") e = lib.setStatus(a1, "approved", (x) => readinessProblems(lib, x));
        if (v === "reject" && e.status === "review") e = lib.setStatus(a1, "draft", () => []);
        out(`✓ 已记录审查（${v}），当前状态：${STATUS_LABEL[e.status]}`, { review: r, entry: e });
        return 0;
      }
      case "bump": {
        const e = lib.bump(a1, (a2 ?? "minor") as "major" | "minor" | "patch");
        out(`✓ ${e.id} → ${e.version}（草稿）`, e);
        return 0;
      }
      default: throw new LibraryError(`未知命令 ${cmd}（lib help）`);
    }
  } catch (e) {
    const err = e as Error;
    if (json) console.log(JSON.stringify({ error: err.message }));
    else console.error(`✗ ${err.message}${e instanceof LibraryError ? "" : "\n" + err.stack}`);
    return 2;
  }
}
