# measure · 测量内核

参考视频分析（`video_analyze`）与成片检测（`scene_measure`，后续阶段）共用的测量库。设计见 [docs/01-reference-analysis.md](../docs/01-reference-analysis.md)。

## 安装

```bash
pip install -e measure[openai]      # 或 [local-asr] 使用 faster-whisper
```

系统依赖：`ffmpeg` / `ffprobe`；生成拼图需要一个 CJK 字体（默认找文泉驿正黑或 Noto Sans CJK）。

## 用法

```bash
cd measure
python -m measure analyze ../video/*.mp4 --out ../analysis/<set>/videos [--asr openai|local|none]
python -m measure profile ../analysis/<set>/videos --out ../analysis/<set>/reference-profile.json
```

结果 JSON 打印到 stdout，日志走 stderr，便于 MCP server 以子进程调用。

环境变量：

| 变量 | 作用 | 默认 |
|---|---|---|
| `VH_ASR_BACKEND` | `openai` / `local` | `openai` |
| `VH_WHISPER_MODEL` | faster-whisper 模型 | `small` |
| `VH_CACHE_DIR` | ASR 结果缓存目录 | `./cache/measure` |

## 模块

| 模块 | 层 | 内容 |
|---|---|---|
| `layout.py` | L2 | 找出全片不变的模板区域与内容区域（固定版式视频的切点只在内容区域检测） |
| `scan.py` | L1 / L3 | 单次全帧扫描：两段式切点检测、亮度差、光流、静止区间 |
| `audio.py` | L0 / L4 | BS.1770 响度、真峰值、节拍、起音点、能量曲线；ffmpeg ebur128 交叉验证 |
| `asr.py` | L1 | 逐词时间戳（可插拔后端）、停顿 |
| `ocr.py` | L2 | OCR 采样、跨帧合并、字幕 / 画面文字 / 常驻文字分类 |
| `track.py` | L3 | 画面文字入场的逐帧模板跟踪、入场时长、位移、cubic-bezier 拟合 |
| `color.py` | L2 | OKLab k-means 调色板 |
| `sheets.py` | L5 / E1 | 每镜三帧拼图、全片总览、切点复核拼图 |
| `analyze.py` | — | 单视频编排，输出 measures / shots / ocr / asr / timeline |
| `profile.py` | — | 多视频聚合为 reference-profile（按画幅分组） |

## 切点检测

两段式（阈值来自 `analysis/chaping` 的人工复核）：

1. **候选**：HSV 内容分的自适应比值 ≥ 2 且内容分 ≥ 8，或内容分 ≥ 30；
2. **确认**：切点前 4 帧与后 3 帧的颜色直方图 Bhattacharyya 距离 `d ≥ 0.42`，且切后画面稳定（切后 3 帧与 0.3s 后的距离 `dp ≤ 0.5`），用于排除 MG 视频中大量"闪一下"的故障风、闪白和全屏动效；
3. 8 帧内只保留 `d` 最大的一个。

每个视频的 `review/cuts.png`（已确认）与 `review/candidates.png`（接近阈值但被拒）用于持续复核。
