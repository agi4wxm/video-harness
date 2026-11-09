// vh compare：用 analyze/（与分析参考视频同一套代码）测量自己的成片，与参考的节奏 / 色彩分布比对。
// 结果是诊断信息，不是闸门：质量靠简报约定 + 看图复核 + 人工 A/B，统计区间只用来发现明显偏离。
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Project } from "./project.ts";
import { REPO, VhError, pythonBin, readJson, writeJson } from "./util.ts";

const METRICS: Array<[string, string, string]> = [
  ["segment_median_s", "rhythm.segment_s.p50", "段时长中位（s）"],
  ["boundaries_per_min", "rhythm.boundaries_per_min", "视觉边界 / 分钟"],
  ["cuts_per_min", "rhythm.cuts_per_min", "硬切 / 分钟"],
  ["boundary_in_pause_share", "narration.boundary_in_pause_share", "画面变化落在停顿里的比例"],
  ["phrase_alignment_gain", "narration.phrase_alignment_gain", "对齐短语边界（相对随机倍数）"],
  ["pauses_per_min", "narration.pauses_per_min", "停顿 / 分钟"],
  ["frame_L_median", "design.L.p50", "画面亮度 L 中位"],
  ["frame_C_median", "design.C.p50", "画面彩度 C 中位"],
];
const get = (o: any, path: string) => path.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);

export function compare(pr: Project, refPath: string, video?: string): Record<string, unknown> {
  const file = video ?? join(pr.paths.renders, existsSync(join(pr.paths.renders, "final.mp4")) ? "final.mp4" : "preview.mp4");
  if (!existsSync(file)) throw new VhError(`没有可比对的成片：${file}`, "vh render --preview");
  if (!existsSync(refPath)) throw new VhError(`参考分析不存在：${refPath}`, "python -m vh_analyze run <参考视频> --out <dir>");
  const out = join(pr.paths.review, "self-analysis");
  const args = ["-m", "vh_analyze", "run", file, "--out", out, "--no-sheets"];
  if (existsSync(pr.paths.voice)) args.push("--asr", `file:${pr.paths.voice}`);
  execFileSync(pythonBin(), args, { cwd: join(REPO, "analyze"), stdio: ["ignore", "ignore", "inherit"] });
  const mine = readJson(join(out, "analysis.json"));
  const ref = readJson(refPath);
  const rows = METRICS.map(([key, path, label]) => {
    const a = get(mine, path), b = get(ref, path);
    return { key, label, mine: a ?? null, ref: b ?? null, ratio: typeof a === "number" && typeof b === "number" && b !== 0 ? +(a / b).toFixed(2) : null };
  });
  const flags = rows.filter((r) => r.ratio !== null && (r.ratio < 0.67 || r.ratio > 1.5)).map((r) => `${r.label}：本片 ${r.mine}，参考 ${r.ref}`);
  const res = { video: file, ref: refPath, rows, flags, note: "偏离 1.5 倍以上的项目列在 flags；这是诊断，不是闸门" };
  writeJson(join(pr.paths.review, "compare.json"), res);
  return res;
}
