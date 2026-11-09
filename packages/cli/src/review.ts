// 看图复核协议（沿用 rea-video 的 tasks / answers 两份文件）：
// vh review tasks  → 每个节拍渲染一张图，生成 review/tasks.json 与 answers.json 模板；
// agent（或换一个全新上下文的子 agent）看图作答；
// vh review apply  → 合并为 review/scorecard.json，记录轮次；P0 未清零不能出 final，3 轮后转人工。
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { z } from "zod";
import { check } from "./check.ts";
import { readStoryboard, type Project } from "./project.ts";
import { stills } from "./render.ts";
import { VhError, readJson, writeJson } from "./util.ts";

const QUESTIONS = [
  { id: "J1", q: "第一眼看到的是不是声明的 focal / idea 里的主体？", severity: "P0" },
  { id: "J2", q: "声明的视觉想法（idea）在画面里能认出来吗？", severity: "P0" },
  { id: "J3", q: "画面和这一拍的旁白（line）说的是同一件事吗？", severity: "P1" },
  { id: "J4", q: "有没有与内容无关、在抢焦点的装饰？", severity: "P1" },
  { id: "J5", q: "看起来廉价吗（对照 references/anti-cheap.md：灰暗、全是字、界面感、模板感、过度辉光）？", severity: "P1" },
  { id: "J6", q: "与前后节拍在色彩、运动方向、焦点位置上衔接吗？", severity: "P2" },
] as const;

const Answer = z.object({
  id: z.string(),
  answers: z.record(z.enum(["pass", "fail", "skip"])).default({}),
  issues: z.array(z.object({
    severity: z.enum(["P0", "P1", "P2"]),
    t: z.number().optional(),
    where: z.string().default(""),
    problem: z.string().min(2),
    fix: z.string().default(""),
    keep: z.string().default(""),
  })).default([]),
});
const Answers = z.object({ reviewer: z.string().default("agent"), tasks: z.array(Answer) });

export async function reviewTasks(pr: Project): Promise<Record<string, unknown>> {
  const sb = readStoryboard(pr);
  const items = sb.shots.flatMap((s) => s.beats.map((b, k) => {
    const nextT = s.beats[k + 1]?.t ?? s.end;
    // 取节拍后段（入场动画基本完成）的画面
    const t = Math.min(s.end - 0.05, b.t + Math.min(1.2, (nextT - b.t) * 0.7));
    return { id: `${s.id}#${k}`, shot: s.id, t: +t.toFixed(2), beat: b, scene: s.scene.kind === "kit" ? s.scene.kit : `${s.scene.kind}:${s.scene.entry}` };
  }));
  const outDir = join(pr.paths.review, "stills");
  const r = await stills(pr, items.map((x) => x.t), outDir);
  const tasks = items.map((x, i) => ({ ...x, image: relative(pr.dir, r.stills![i]), questions: QUESTIONS.map((q) => ({ ...q })) }));
  writeJson(join(pr.paths.review, "tasks.json"), {
    instructions: "逐条看 image，只按画面作答；不要看代码和创作过程。每个 fail 都要在 issues 里写：t · 位置 · 问题 → 改法 · 保留什么。",
    sheet: relative(pr.dir, r.sheet!), tasks,
  });
  const ans = join(pr.paths.review, "answers.json");
  if (!existsSync(ans)) writeJson(ans, { reviewer: "agent", tasks: tasks.map((x) => ({ id: x.id, answers: {}, issues: [] })) });
  return { tasks: tasks.length, sheet: r.sheet, file: join(pr.paths.review, "tasks.json"), answers: ans, next: "看图填写 review/answers.json，然后 vh review apply" };
}

export async function reviewApply(pr: Project): Promise<Record<string, unknown>> {
  const ansPath = join(pr.paths.review, "answers.json");
  if (!existsSync(ansPath)) throw new VhError("没有 review/answers.json", "vh review tasks");
  const tasksFile = readJson<{ tasks: Array<{ id: string; t: number; questions: Array<{ id: string; severity: string }> }> }>(join(pr.paths.review, "tasks.json"));
  const a = Answers.parse(readJson(ansPath));
  const known = new Set(tasksFile.tasks.map((x) => x.id));
  const issues: Array<Record<string, unknown>> = [];
  let unanswered = 0;
  for (const t of a.tasks) {
    if (!known.has(t.id)) throw new VhError(`answers 里的 ${t.id} 不在 tasks.json 中（分镜改过后要重新 vh review tasks）`);
    const task = tasksFile.tasks.find((x) => x.id === t.id)!;
    if (!Object.keys(t.answers).length) unanswered++;
    for (const q of task.questions) if (t.answers[q.id] === "fail" && !t.issues.length) {
      issues.push({ task: t.id, severity: q.severity, t: task.t, where: "", problem: `${q.id} 未通过（未写具体问题）`, fix: "", keep: "" });
    }
    for (const i of t.issues) issues.push({ task: t.id, t: i.t ?? task.t, ...i });
  }
  const prevPath = join(pr.paths.review, "scorecard.json");
  const prev = existsSync(prevPath) ? readJson<{ round: number }>(prevPath) : { round: 0 };
  const checks = await check(pr, "all");
  const count = (s: string) => issues.filter((i) => i.severity === s).length;
  const round = prev.round + 1;
  const card = {
    round, reviewer: a.reviewer, unanswered,
    review: { P0: count("P0"), P1: count("P1"), P2: count("P2"), issues },
    checks: checks.summary,
    pass: count("P0") === 0 && unanswered === 0,
    escalate: round >= 3 && count("P0") > 0 ? "已修复 3 轮仍有 P0：转人工决定" : null,
  };
  writeJson(prevPath, card);
  return { ...card, review: { P0: card.review.P0, P1: card.review.P1, P2: card.review.P2 }, file: prevPath };
}
