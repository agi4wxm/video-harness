// vh status：流程状态完全由项目文件推导（不存在 server 内存里），并给出下一步命令。
import { existsSync } from "node:fs";
import { join } from "node:path";
import { check } from "./check.ts";
import type { Project } from "./project.ts";
import { mtime, readJson } from "./util.ts";

export interface Stage { id: string; title: string; ok: boolean; detail: string; next: string }

export async function status(pr: Project): Promise<{ project: string; stages: Stage[]; current: string; next: string }> {
  const stages: Stage[] = [];
  const push = (id: string, title: string, ok: boolean, detail: string, next: string) => stages.push({ id, title, ok, detail, next });
  const errs = async (st: string) => (await check(pr, st)).issues.filter((i) => i.level === "error");
  const fmt = (xs: Array<{ rule: string; msg: string }>) => (xs.length ? `${xs.length} 个问题，如 [${xs[0].rule}] ${xs[0].msg}` : "通过");

  const b = await errs("brief");
  push("brief", "创意简报（人工确认）", b.length === 0, fmt(b), "写 brief.md（references/brief.md），给用户确认后改 status: approved");
  const sc = existsSync(pr.paths.script);
  push("script", "旁白文案", sc, sc ? "script.md 已有" : "没有 script.md", "写 script.md（references/voice.md：句子短、段落之间留停顿）");
  const v = await errs("voice");
  push("voice", "配音与时间轴", v.length === 0, fmt(v), "vh voice（先预估字符，确认后 vh voice --yes）");
  const s = await errs("storyboard");
  push("storyboard", "分镜（人工确认）", s.length === 0, fmt(s), "写 storyboard.json（references/storyboard.md），vh check storyboard，给用户确认后 approved: true");
  const bu = await errs("build");
  push("build", "镜头构建", bu.length === 0, fmt(bu), "写 local / html 镜头，vh build，vh check build");
  const l = await errs("layout");
  push("layout", "版面校验", l.length === 0, fmt(l), "按问题修改参数或镜头代码，vh check layout");
  const prev = join(pr.paths.renders, "preview.mp4");
  const fresh = (f: string) => existsSync(f) && mtime(f) >= Math.max(mtime(pr.paths.storyboard), mtime(pr.paths.voice));
  // 已有更新的成片时，预览不再必需
  const prevOk = fresh(prev) || fresh(join(pr.paths.renders, "final.mp4"));
  push("preview", "低清预览", prevOk, prevOk ? "renders/preview.mp4 是最新的" : "没有或已过期", "vh render --preview");
  const cardPath = join(pr.paths.review, "scorecard.json");
  const card = existsSync(cardPath) ? readJson<{ pass: boolean; round: number; review: { P0: number }; escalate: string | null }>(cardPath) : null;
  const tasksFresh = existsSync(join(pr.paths.review, "tasks.json")) && mtime(join(pr.paths.review, "tasks.json")) >= mtime(pr.paths.storyboard);
  const revOk = !!card && card.pass && tasksFresh && mtime(cardPath) >= mtime(pr.paths.storyboard);
  push("review", "看图复核", revOk, card ? `第 ${card.round} 轮，P0=${card.review.P0}${card.escalate ? "；" + card.escalate : ""}${tasksFresh ? "" : "；分镜改过，需重新出题"}` : "还没复核", "vh review tasks → 看图填写 answers.json → vh review apply");
  const r = await errs("render");
  push("final", "成片（规格 + 响度）", r.length === 0, fmt(r), "vh render --final，然后 vh check render");
  const cur = stages.find((x) => !x.ok);
  return { project: pr.file.name, stages, current: cur?.id ?? "done", next: cur?.next ?? "完成。可选：vh compare --ref <参考分析> 与参考视频比对" };
}
