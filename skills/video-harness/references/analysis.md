# 拆参考视频

目标不是写观后感，而是得到**能写进简报和分镜的东西**：这段是怎么做出来的、用什么节奏、什么颜色、每个画面背后的视觉想法。

## 两层工具

| 工具 | 回答什么 |
|---|---|
| [rea-video](https://github.com/JuneYaooo/rea-video)（底座） | 逐镜制作方式（2D 动画 / 代码渲染 / 3D / 实拍 / AI 视频…）及证据、包装层（字幕 / 花字 / 贴纸）、声音分轨、看图复核协议。按它的 SKILL.md 做，**复核低置信度镜头** |
| `vh_analyze`（本仓库 `analyze/`） | rea-video 不做的：版式感知切镜（只在内容区里算）、镜头内的视觉节拍、旁白锚定（画面变化落在停顿里的比例、对齐短语边界相对随机的倍数）、OKLab 调色板与亮度 / 彩度、多条视频聚合 |

```bash
cd analyze
.venv/bin/python -m vh_analyze run <video> --out <dir> --asr openai --lang en [--rea]   # 有 rea-video 时加 --rea
.venv/bin/python -m vh_analyze profile <dir1>/analysis.json <dir2>/analysis.json --out profile.json
```

输出 `<dir>/analysis.json`（`rhythm` / `narration` / `design` / `rea`）和 `contact/` 拼图。**看 stdout 的摘要和拼图，不要整份读 JSON。**

## 读结果

- `rhythm.segment_s.p50`、`boundaries_per_min`：画面多久变一次（段 = 硬切 ∪ 视觉节拍）。
- `narration.boundary_in_pause_share` 对比 `random_in_pause_share`：画面是不是"等一句话说完才换"。
- `narration.phrase_alignment_gain`：≈1 没对齐，>1.5 明显对齐。
- `design.palette` / `L` / `C`：主色、亮度、彩度。
- `rea.segments[].route`：每段如果要复刻，用本项目的哪种代码路线（rea-video 判成 AI 视频 / 实拍的段落会改写成插画或 Three.js 场景，或标记"需要用户提供素材"）。

## 写进简报

把结论翻译成 `direction`（设计包、章节色、语义色、母题、Banned）和 `structure`（节奏）。一条视频只代表这一条，3–5 条里稳定的部分才是风格（用 `profile`）。**借鉴原则，不复刻具体角色和视觉标识。**

已沉淀的结论见 [taste/](taste/)。
