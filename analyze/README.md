# analyze · vh_analyze

video-harness 的分析层，建在 [rea-video](https://github.com/JuneYaooo/rea-video) 之上：rea-video 负责逐镜制作方式、包装层、声音分轨与看图复核；这里补它不做的部分。**同一套代码分析参考视频和检测自己的成片**，数字可以直接比较。

| 模块 | 作用 |
|---|---|
| `layout.py` | 版式感知：逐像素时间方差找出全片不变的模板区域，后续只在内容区计算 |
| `scan.py` | 两段式硬切检测（自适应内容分候选 + 直方图距离与切后稳定性确认）；32×32 结构差检测视觉节拍；静止区间 |
| `asr.py` | 逐词时间戳：`openai`（whisper-1）/ `local`（faster-whisper）/ `file:voice.json`（自己的成片，时间轴已知） |
| `analyze.py` | `run`：节奏、旁白锚定（停顿内比例、短语对齐相对随机倍数）、调色板与亮度 / 彩度 → `analysis.json` |
| `color.py` | OKLab k-means 调色板（纯 numpy），与 `packages/core/src/color.ts` 同口径 |
| `rea.py` | 调用 / 读取 rea-video 的 `breakdown.json`，映射到内容区的段上，并把复刻路线改写为代码路线 |
| `profile.py` | 多条视频聚合成分布（P10 / P50 / P90） |
| `evalsynth.py` | 在 `vh eval synth` 生成的合成视频上给切点 / 转场 / 节拍检测打分 |
| `sheets.py` | 每段三帧拼图、全片总览、切点复核拼图 |

```bash
python3 -m venv .venv && .venv/bin/pip install -e '.[openai,dev]'
.venv/bin/python -m vh_analyze run <video> --out <dir> [--asr openai|local|file:<voice.json>] [--lang en] [--rea]
.venv/bin/python -m vh_analyze profile <a.json> <b.json> --out profile.json
.venv/bin/python -m vh_analyze eval-synth ../eval/synthetic/out
.venv/bin/python -m pytest -q tests
```

已退役（旧 `measure/`）：OCR 文字分类、响度测量、入场缓动拟合——前两项由 rea-video / `vh check render` 覆盖，自己成片的元素信息直接来自场景图（`vh check layout`），缓动拟合未通过验证。
