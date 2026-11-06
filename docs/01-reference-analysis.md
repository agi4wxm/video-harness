# 01 · 参考视频分析

> 目标：给定一组现成的好视频，产出**机器可读、可执行、可验证**的借鉴结果，而不是一段文字感想。

## 1. 原则

1. **先用工具测量，再让模型解读。** 不把视频逐帧丢给模型。先用确定性工具把视频转成数字和少量关键图，模型只在需要语义判断时介入。
2. **风格是分布，不是单个数值。** 分析一条视频得到的是这条的内容；分析同一作者的 3–5 条视频，稳定不变的部分才是风格。所有指标都输出中位数和 P10–P90 区间。
3. **提取出的每一条都要能落地。** 必须能对应到 harness 里的一个设计变量、一条规则或一个积木组件；对应不上的单独标记。
4. **与成片检测共用测量代码。** `video_analyze` 用来分析参考视频，`scene_measure` 用来检测成片，两者调用同一个测量库。

## 2. 提取什么：六层模型

越往上越可测量，越往下越需要理解。最有价值、也最难提取的是 L3 动效语言和 L5 修辞隐喻。

| 层 | 内容 | 落地为 |
|---|---|---|
| **L0 技术** | 分辨率、帧率、时长、整体响度（LUFS）、真峰值 | 渲染参数 |
| **L1 节奏结构** | 切点时间、镜头时长分布、每分钟切镜次数；**视觉节拍**（同一镜头内构图的实质变化，MG 视频的主要节奏单位）与段时长分布；切点与语音的关系（词边界 / 句子边界 / 节拍）；开头钩子时长；段落结构（钩子 / 问题 / 解释 / 证据 / 行动号召）；语速与信息密度 | 分镜规则、时间约束 |
| **L2 视觉语言** | 主色与强调色、背景处理；字体类别、字号占画面高度比例、字重；每行字数、同屏文字组数；留白比例、布局网格、安全区 | `theme.ts` 设计变量 |
| **L3 动效语言** | 入场 / 出场时长；缓动曲线形状（cubic-bezier 或弹簧参数）；逐个出现的间隔；镜头运动（推、拉、摇）；转场类型；运动强度随时间的曲线；入场后的停留时长 | 动效预设（具名的缓动与时长） |
| **L4 声音** | 语速与停顿；配乐 BPM；音效与画面击打点的对齐；人声出现时配乐压低的幅度 | 音频规则 |
| **L5 修辞与隐喻** | 哪些词被画出来、哪些只在字幕里；某类概念被画成什么（"增长"、"对比"、"流程"、"因果"）；每镜承载的概念数；强调词的处理方式 | 镜头配方卡片、复刻积木 |

## 3. 怎么提取：测量流水线

```
输入视频
  ├─ ffprobe / pyloudnorm ────────────────▶ L0
  ├─ 版式检测：找出不变的模板区域，只在内容区域内测量
  ├─ whisper（逐词时间戳）─┐
  ├─ 切点 + 视觉节拍检测 ──┼─ 对齐 ───────▶ L1
  ├─ 每镜关键帧 ──┬─ OKLab k-means ───────▶ L2 调色板
  │               └─ PaddleOCR 文字框 ────▶ L2 字号 / 组数 / 在屏时长
  ├─ 元素逐帧跟踪 → 位置/缩放曲线 → 拟合 ─▶ L3 缓动 / 时长 / 间隔
  ├─ 光流 → 每秒运动强度 ─────────────────▶ L3 运动强度曲线
  ├─ librosa 节拍 / 起音点 + 与运动峰对齐 ▶ L4
  └─ 每镜拼图（起/中/终三帧 + 对应文案）→ VLM（封闭词表）▶ L5
```

### 3.1 各层方法

| 层 | 方法 | 输出 |
|---|---|---|
| L0 | `ffprobe` 读规格；`pyloudnorm` 测 integrated LUFS 和 true peak | 标量 |
| L1 | 两段式切点检测（自适应内容分候选 + 直方图距离与切后稳定性确认，见 `measure/README.md`）；32×32 灰度结构差检测视觉节拍；切点 ∪ 节拍 = 段，段是 L5 标注单位；whisper 产出逐词时间戳；对每个切点求到最近词边界、句子边界、节拍的距离 | 切点列表、镜头时长分布、对齐距离分布 |
| L2 | 每镜抽 3 张关键帧；在 OKLab 空间做 k-means（k=5），按面积排序得到主色 / 强调色；PaddleOCR 得到文字框，换算成"字高 ÷ 画面高"、每行字数、同屏组数、文字在屏时长 | 调色板、字号分布、文字密度 |
| L3 | 用 OCR 框或模板匹配逐帧跟踪同一元素，得到 x/y/scale/opacity 随时间的曲线；按归一化进度拟合 cubic-bezier 和弹簧（stiffness/damping），取误差小者；用 Farneback 或 RAFT 光流计算每秒平均运动幅度 | 缓动参数分布、入场时长分布、间隔分布、运动强度曲线 |
| L4 | librosa 做节拍跟踪和起音点检测；把音效起音点与 L3 运动峰对齐；对比人声段和非人声段的配乐电平 | BPM、对齐误差分布、压低幅度 |
| L5 | 每镜生成一张拼图（起点 / 中点 / 终点 + 对应文案），交给 VLM，**只允许从封闭词表中选择**（见 3.2），并要求给出依据的时间点 | 每镜的结构化标签 |

### 3.2 L5 封闭词表（v0）

不让 VLM 自由描述，只让它做选择题。词表会随分析积累扩充。**这套词表同时也是素材库的标签词表**（见 [03 §2](03-asset-library.md#2-统一清单assetyaml)），分析结果因此能直接检索到对应素材。

```yaml
shot_type: [kinetic-text, stat-number, chart-bar, chart-line, chart-pie, comparison-split,
            process-flow, timeline, map, 3d-object, 3d-scene, ui-mockup, logo, icon-grid,
            quote, list, diagram, live-footage, talking-head, screenshot, generative-footage, other]
metaphor:  [growth-rise, decline-fall, contrast-split, accumulation-stack, flow-path,
            cause-effect-arrow, zoom-detail, reveal-mask, transform-morph, scale-compare, none]
focal_position: [center, upper-third, lower-third, left, right, full-frame]
emphasis_treatment: [color, scale, weight, underline-marker, box, motion-pop, none]
cut_in: [hard-cut, match-cut, j-cut, l-cut, beat-cut, jump-cut, transition, breath]  # 进入本镜的方式
concepts_per_shot: 1 | 2 | 3+
visualized_words: [<文案中被画出来的词>]
evidence_t: <作答依据的时间点>
```

### 3.3 输出物

```
analysis/<ref-set>/
  videos/<id>/
    measures.json        # L0–L4 原始测量
    shots.json           # 切点、每镜 L2/L3 测量 + L5 标签
    contact/*.png        # 每镜拼图
  reference-profile.json # 跨视频聚合后的分布（风格）
  recipes/*.md           # 镜头配方卡片（草稿）
  replicas/              # 标志性镜头的代码复刻（草稿）
```

配方和复刻经 `recipe_add` / `asset_promote` 以 draft 级别进入素材库（`library/recipes/`、`library/blocks/` 等），之后按 [03 §4.2](03-asset-library.md#42-质量分级) 分级。剪辑手法（J-cut、匹配剪辑、卡点等）的识别结果同样沉淀为 `technique.edit` 素材。

`reference-profile.json` 结构示意：

```jsonc
{
  "source": { "videos": ["a.mp4", "b.mp4", "c.mp4"], "author": "…", "aspect": "9:16" },
  "rhythm": {
    "shot_duration_s": { "p10": 1.4, "p50": 2.6, "p90": 4.8 },
    "cuts_per_min":    { "p10": 16, "p50": 22, "p90": 30 },
    "cut_to_word_boundary_ms": { "p50": 40, "p90": 120 },
    "hook_duration_s": { "p50": 2.8 }
  },
  "visual": {
    "palette": { "bg": "#0E0F13", "fg": "#F4F4F5", "accent": ["#FFCC00", "#3B82F6"] },
    "text_height_ratio": { "title": { "p50": 0.055 }, "body": { "p50": 0.028 } },
    "text_groups_on_screen": { "p90": 3 },
    "chars_per_line": { "p90": 11 }
  },
  "motion": {
    "enter_duration_s": { "p10": 0.28, "p50": 0.45, "p90": 0.7 },
    "stagger_ms":       { "p50": 70 },
    "easing_clusters": [ { "name": "snap-out", "bezier": [0.2, 0.9, 0.1, 1.0], "share": 0.62 } ],
    "max_static_s":     { "p90": 1.2 }
  },
  "audio": { "lufs": -14.2, "music_duck_db": 12, "sfx_to_hit_ms": { "p90": 33 } },
  "rhetoric": {
    "shot_type_share": { "stat-number": 0.22, "kinetic-text": 0.30, "chart-bar": 0.12 },
    "concept_to_metaphor": { "增长": "growth-rise", "对比": "contrast-split" }
  },
  "unmapped": [ "某段手绘质感背景暂无对应积木" ]
}
```

### 3.4 镜头配方卡片格式

```markdown
# recipe: stat-punch
- 触发：文案中出现关键数字，且该句为论点句
- 布局：数字居中偏上（upper-third），单位缩小 50% 跟随；下方一行说明 ≤ 10 字
- 动效：数字计数 0.6s（snap-out），结束时 scale 1.0→1.08→1.0；说明文字延迟 120ms 入场
- 时长：1.8–3.0s；数字定格 ≥ 0.8s
- 声音：计数结束点配一个短促击打音效，偏差 ≤ 1 帧
- 来源：b.mp4 @ 00:12.4、c.mp4 @ 00:31.0
- 对应积木：blocks/stat-punch（参数：value, unit, caption, accent）
```

## 4. 怎么评估提取结果

| # | 方法 | 回答的问题 | 怎么做 |
|---|---|---|---|
| E1 | **测量层准确率** | 工具测得准不准？ | 挑 3 条视频人工标注真值；切点检测 F1 ≥ 0.9、OCR 文字召回 ≥ 0.9、BPM 误差 ≤ 2%、缓动拟合 RMSE ≤ 0.05（归一化） |
| E2 | **重建测试**（核心） | profile 抓住了多少风格？ | 用原视频的文案 + profile 让 harness 重做一遍，再用同一套测量比较：镜头时长分布距离（Wasserstein）、调色板 ΔE、运动强度曲线相关系数、文字密度差。同时**不带 profile 生成一版作对照**，差距缩小的量就是这次提取的价值 |
| E3 | **可执行率** | 提取出的东西有没有用？ | 统计 profile 和配方中能映射到设计变量 / 规则 / 积木的条目占比；`unmapped` 列表就是积木库的待办 |
| E4 | **人工盲测** | 像不像？ | 把带 profile 的重建版和对照版随机排序放在一起，由人选出更像参考视频的一条；记录胜率 |

E1 不过关，后面全都不可信，所以 E1 先做。E2 是判断整套方法是否成立的主要依据。

## 5. MCP 工具

| 工具 | 输入 | 输出 |
|---|---|---|
| `video_analyze` | 视频文件路径 | `measures.json`、`shots.json`、拼图（拼图以 image content 返回） |
| `segments_label` | 拼图 + 文案 | 由客户端模型按 L5 封闭词表为每段作答，server 校验格式后写回 `shots.json` |
| `profile_build` | 多个视频的分析结果 | `reference-profile.json` |
| `recipe_add` | 配方内容 | 校验格式后以 draft 级别写入素材库 `library/recipes/` |
| `reconstruct_eval` | 原视频 + 重建视频 | E2 各项距离 |

## 6. 待定事项

- 参考视频集：需要 3–5 条，来自同一位或两位作者。
- 元素跟踪在复杂背景下的稳定性需要实测；不稳定时退回到"只测入场时长、不拟合曲线"。
