# eval

| 目录 | 内容 |
|---|---|
| `synthetic/` | 合成评测集的生成参数与打分说明；视频与 `results.json` 输出到 `synthetic/out/`（不进 git，由 seed 复现） |
| `negatives/` | 反面样本：统计指标全部达标但看起来廉价的成片（复核 J5 的对照） |
| `RESULTS.md` | 每次评测的结果与改动记录 |

做法见 [docs/dev/evaluation.md](../docs/dev/evaluation.md)。
