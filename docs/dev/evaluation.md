# 评测纪律

沿用 rea-video 的做法：真值来源分级、调参集与留出集分开、每次改动如实记录到 `eval/RESULTS.md`（包括变差的结果）。

## 合成集（真值来自场景图）

```bash
vh eval synth --n 4 --seed 1 --out eval/synthetic/out --scale 0.5     # 随机分镜 × 内置积木 → 渲染 + truth.json
cd analyze && .venv/bin/python -m vh_analyze eval-synth ../eval/synthetic/out   # → results.json
```

- `truth.json`：切点（含转场类型与时长）、文字元素首次出现时刻、每段的制作方式（code_render）。
- 指标：硬切召回 / 精确率（容差 2 帧）；转场召回（检测落在转场区间内）；文字出现事件召回（作为视觉节拍真值的代理，事件后 0.6s 内）。
- `seed=1` 是**调参集**；改算法时只看它。`seed=2` 起作为**留出集**，规则冻结后才第一次跑，并在 RESULTS.md 标明。
- 生成的视频不进 git（可由 seed 复现）。

## 真实视频（留出集）

每类 3–5 条（插画科普、竖屏 MG、3D 讲解、数据新闻），人工看图标注切点与制作方式，标注来源写"人工（存疑）"。**只验收，不调参。**

## 什么时候必须跑

- 改了 `analyze/` 的检测算法：合成集 + 留出集。
- 改了积木 / 渲染器：合成集（同时是渲染回归测试）。
- 结果写进 `eval/RESULTS.md`：日期、改动、各项指标、与上次对比、已知失败。
