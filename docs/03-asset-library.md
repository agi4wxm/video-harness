# 03 · 素材库

> 目标：所有可复用的东西，无论是一张图、一个 3D 模型、一段动效代码、一组参数，还是一种剪辑手法，都用**同一套方式**描述、检索、预览、引用和沉淀。

## 1. 素材种类：五大类

| 大类 | 是什么 | 例子 |
|---|---|---|
| **A 媒体文件** | 现成文件，拿来就用 | 图片、图标、logo、SVG、视频片段、生成式镜头、纹理 / 背景、3D 模型（GLB）、HDRI 环境贴图、PBR 材质、Lottie、字体、调色 LUT；配乐、音效、环境音 |
| **B 代码组件** | 接收参数、渲染出画面的代码 | 元件（字幕、强调标记）；积木（整镜模板：数字冲击、柱状图）；效果（辉光、颗粒、色差、模糊等着色器 / 后期）；转场（遮罩擦除、缩放穿越、形变）；动效（逐字弹出、计数、路径描边）；镜头运动（推、拉、环绕）；3D 场景装置（灯光方案、相机机位、地面反射） |
| **C 预设参数** | 一组数值，不是代码 | 风格包（色板、字体、动效变量）；缓动 / 时长预设；字幕样式；调色预设；混音预设 |
| **D 手法与模式** | 知识：怎么用、何时用 | 镜头配方（数字冲击、左右对比）；剪辑手法（J-cut、L-cut、匹配剪辑、跳切、卡点、硬切、留白）；叙事结构（钩子模板、问题→答案→证据）；隐喻映射（"增长""因果"画成什么） |
| **E 范例** | 已经做出来的好镜头 | 参考视频中分析过的镜头；自己以往项目中的高分镜头，附截图、评分卡和来源 |

### 1.1 剪辑手法的特殊性

剪辑手法不是文件，而是**时间轴上的结构或约束**，因此落在两处：

1. **分镜格式能表达它**：转场是镜头之间的独立对象；音频与画面起止点允许错开（`audio_offset`）。见 [00-architecture.md §5](00-architecture.md#5-分镜格式storyboardjson)。
2. **校验器能检查它**：每个 `technique.edit` 素材自带可检查的约束。

| 手法 | 分镜表达 | 校验约束 |
|---|---|---|
| J-cut | 下一镜 `audio_offset.in < 0` | 提前量 0.2–1.0s；提前段内本镜画面仍有运动 |
| L-cut | 本镜 `audio_offset.out > 0` | 延后量 0.2–1.0s |
| 匹配剪辑 | `technique: match-cut` | 切点前后焦点元素的中心距离 ≤ 画面宽 8%，尺寸比 0.7–1.4 |
| 卡点 | `technique: beat-cut` | 切点与最近节拍偏差 ≤ 1 帧 |
| 硬切 | 无转场对象 | 前后镜头的运动方向或色彩有明显对比 |
| 留白 | `technique: breath` | 0.5–1.5s 内画面变化低、无新文字；仅用于段落边界 |

## 2. 统一清单：asset.yaml

```yaml
id: block/stat-punch@1.2.0
kind: block
  # media.image | media.icon | media.logo | media.svg | media.video | media.model3d | media.hdri
  # media.material | media.lottie | media.font | media.lut | media.music | media.sfx | media.ambience
  # element | block | effect | transition | motion | camera | rig3d
  # preset.style | preset.motion | preset.caption | preset.grade | preset.mix
  # technique.edit | recipe | narrative | metaphor | exemplar
title: 数字冲击
summary: 关键数字计数入场后弹一下，下方一行说明
tags:                          # 与分析阶段的 L5 封闭词表共用
  shot_type: [stat-number]
  metaphor: [growth-rise]
  mood: [punchy]
  aspect: [9:16, 16:9]
entry: ./index.tsx             # 代码类入口；媒体类为 blob: sha256:…
params_schema: ./schema.ts     # zod；校验和文档都由此生成
preview: [./preview.gif, ./contact.png]
deps: [media.font/inter-display@1.0.0, media.sfx/hit-short@1.0.0]
implements: [recipe/stat-punch]   # 实现了哪些手法 / 配方
constraints:                      # 使用约束，校验器检查
  duration_s: [1.8, 3.0]
  max_per_minute: 2
provenance:
  source: replica-of analysis/set-a/b.mp4@00:12.4   # poly-haven | lottiefiles | self-made | generated(kling) | promoted-from projects/x/s03
  license: self-made              # CC0 | CC-BY-4.0 | 仅个人使用 | …
  attribution: null
quality:
  status: golden                  # draft → verified → golden；deprecated
  uses: 14
  p0_rate: 0.0
  last_scored: 2026-11-01
```

三条关系链：

- **`tags`** 与分析共用词表：分析出"这里用了 growth-rise"，可直接检索到对应积木。
- **`implements`** 连接 D 类（手法）与 B 类（实现）：agent 先选手法，再找实现。
- **`deps`** 连接代码组件与它用到的媒体、字体：引用时一起锁定版本。

### 2.1 版本规则

- 语义化版本。参数 schema 不兼容的改动升主版本。
- 项目通过 `asset-lock.json` 锁定版本，素材库升级不会改动已有项目。
- 分镜中引用可写 `@1.2`（锁定到该次版本的最新补丁）或完整版本。

## 3. 入库处理（规范化）

Remotion 要求确定性渲染且不在运行时联网，外部素材入库时必须规范化：

| 类型 | 处理 |
|---|---|
| 3D 模型 | gltf-transform 压缩（draco / meshopt）、统一单位与朝向、生成预览；自带动画由帧号驱动（`mixer.setTime(frame / fps)`） |
| HDRI / 纹理 / 材质 | 统一分辨率，转 KTX2 或 webp |
| 图片 / logo / SVG | 抠图、转 webp；SVG 清理；身份类素材必须登记来源 |
| 视频片段 | 统一帧率与编码，生成拼图 |
| Lottie | 校验可按帧定位；通过 `@remotion/lottie` 渲染 |
| 音频 | 统一采样率；音效裁首尾静音并标注起音点；配乐测 BPM 与段落 |
| 字体 | 子集化，登记授权 |
| 着色器 / 效果 | 只依赖帧号等参数；随机数必须带种子 |

入库后自动完成：生成预览（代码类用默认参数渲染）、计算 CLIP 向量（视觉类）、写入索引。

## 4. 来源与沉淀

```
① 参考分析：复刻参考视频的标志性镜头 ─────┐
② 项目沉淀：好镜头泛化后入库（asset_promote）┤
③ 外部导入：Poly Haven、LottieFiles、        ├─▶ 入库处理 ─▶ draft ─▶ verified ─▶ golden
   Freesound、Iconify、Google Fonts 等       │
④ 生成：图片 / 视频 / 3D 生成 API ───────────┘
```

### 4.1 项目沉淀（最有价值的来源）

`asset_promote` 的前提：该镜头评分卡全部通过，且经人工确认。流程：

1. 把镜头中写死的内容（文字、数值、颜色引用）抽成参数，生成参数 schema；
2. 用两组不同参数各渲染一次，确认泛化后仍通过硬约束；
3. 生成预览，补全标签，以 draft 入库。

### 4.2 质量分级

| 级别 | 条件 | 能否被 agent 默认检索到 |
|---|---|---|
| draft | 刚入库 | 否（需显式指定或人工确认） |
| verified | 预览通过硬约束 + 人工看过一次 | 是 |
| golden | 使用 ≥ 5 次且 P0 率 ≤ 5% | 是，排序优先 |
| deprecated | P0 率 > 20%，或被新版本取代 | 否 |

评分卡中的每个问题都记录涉及的素材 id，素材库据此更新 `uses` 与 `p0_rate`。

### 4.3 防止滥用

- 每个素材可声明 `max_per_minute`；全片同一效果默认每分钟 ≤ 2 次。
- 记录每个素材最近在哪些项目中用过；连续项目重复使用同一个积木作为钩子镜头时给出提示。

## 5. MCP 工具

| 工具 | 作用 |
|---|---|
| `asset_search` | 按 `kind` / `tags` 结构化筛选 + 语义检索（媒体用 CLIP，代码与手法用全文）；默认只返回 verified 及以上 |
| `asset_get` | 返回文档、参数 schema、约束和预览图（以 image content 返回） |
| `asset_preview` | 用给定参数渲染一帧或一张拼图，先看效果再决定 |
| `asset_use` | 把素材引入项目，锁定版本并写入 `asset-lock.json`，连同 `deps` |
| `asset_ingest` | 导入外部素材：下载、规范化、登记来源与授权 |
| `asset_generate` | 调用生成式 API 产出素材；预算闸门 + 内容哈希缓存，结果以 draft 入库 |
| `asset_promote` | 把项目镜头泛化入库（见 §4.1） |

## 6. 存储

```
library/
  elements/ blocks/ effects/ transitions/ motions/ cameras/ rigs3d/   # 代码 + asset.yaml，进 git
  presets/ techniques/ recipes/ narratives/ metaphors/ exemplars/     # yaml / md，进 git
  media/<kind>/<id>/asset.yaml                                        # 媒体清单进 git
blobs/<sha256>                                                        # 大文件，不进 git（或用 LFS）
library.db                                                            # SQLite：全文 + 向量索引，可由清单重建
```

清单是唯一事实来源；索引随时可从清单重建。

**v0 实现**：索引是 `library/index.json`（由 `engine` 的 `npm run index` 生成，含参数 JSON Schema），检索为标签过滤 + 关键词匹配；SQLite 全文 / 向量索引在素材数量变多后再加。小于 1MB 的媒体文件直接与 `asset.yaml` 放在一起提交；字体通过 npm（`@fontsource`）随引擎打包，`entry: npm:<包名>`。

## 7. 与其他部分的关系

| 部分 | 关系 |
|---|---|
| 参考分析（01） | 配方卡片、复刻镜头直接作为素材入库（draft）；L5 词表即素材标签词表 |
| 质量规范（02） | 新增 H13–H15、M18：素材级别、手法约束、使用频率 |
| 架构（00） | 素材库服务位于能力层；分镜按素材 id 引用；评分卡问题归因到素材 |
