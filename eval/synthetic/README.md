# 合成评测集

```bash
vh eval synth --n 4 --seed 1 --out eval/synthetic/out --scale 0.5
cd analyze && .venv/bin/python -m vh_analyze eval-synth ../eval/synthetic/out
```

每条视频 5–7 个镜头，积木、参数、章节色板、转场（60% 硬切，其余 fade / push-left / wipe / zoom）都由 seed 决定。`seed=1` 为调参集，其他 seed 为留出集。
