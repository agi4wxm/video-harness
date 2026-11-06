# 00 · 整体架构

> 一个负责编排的 MCP Server，下挂两条对称的流水线（分析、生成），两条线共用一套测量内核和一个素材库，所有中间结果都以文件形式落盘。

## 1. 分层总览

```
┌──────────────────────────────────────────────────────────────────────┐
│  MCP 客户端（Claude Code / Codex / Cursor …）                        │
│  负责：写文案 · 写分镜 · 写 TSX · 看拼图答题 · 修复                   │
└───────────────▲──────────────────────────────────┬───────────────────┘
                │ prompts / resources / images      │ tool calls
┌───────────────┴──────────────────────────────────▼───────────────────┐
│  L1  MCP 网关（TS）                                                   │
│      工具注册 · 参数校验 · 长任务（job + 进度）· 返回图片              │
├──────────────────────────────────────────────────────────────────────┤
│  L2  编排内核（TS）                                                   │
│      项目状态机 · 闸门（硬约束 / 人工确认）· 修复轮次 · 预算 · 续跑    │
├───────────────┬──────────────────────┬───────────────────────────────┤
│  L3a 分析流水线│  L3b 生成流水线       │  L3c 评审                     │
│  video_analyze │  voice → storyboard  │  snapshot · inspect           │
│  profile_build │  → scene build       │  → measure → scorecard        │
│  recipe/replica│  → render            │  → review_record              │
├───────────────┴──────────────────────┴───────────────────────────────┤
│  L4  能力层                                                           │
│  ┌────────────┐ ┌────────────┐ ┌──────────┐ ┌──────────────────────┐ │
│  │测量内核(Py) │ │渲染引擎(TS)│ │ 音频(Py)  │ │ 素材库服务(TS)        │ │
│  │切点 OCR 光流│ │Remotion    │ │TTS 对齐   │ │清单 · 检索 · 入库处理 │ │
│  │色彩 响度 跟踪│ │theme+引擎  │ │混音 响度  │ │版本 · 分级 · 生成式   │ │
│  └────────────┘ └────────────┘ └──────────┘ └──────────────────────┘ │
├──────────────────────────────────────────────────────────────────────┤
│  L5  文件存储：projects/ · analysis/ · library/ · blobs/ · evals/ · cache/ │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.1 职责边界

| 谁 | 做什么 | 不做什么 |
|---|---|---|
| 客户端 agent | 所有创意决策；所有需要"看"和"理解"的判断（拼图由它的模型来看） | 不管流程顺序，不判定质量是否合格 |
| 编排内核 | 决定下一步能做什么；判定能否过闸门；记录轮次、成本、决策 | 不做任何创意或审美判断 |
| 能力层 | 确定性的计算、渲染、检索 | 不调用大模型 |

**server 本身不调用任何 LLM / VLM**，所有模型调用都发生在客户端，换一个 agent 整个 harness 照样可用。唯一例外是生成式 API（图片、视频、3D），它们只是素材来源，不参与决策。

## 2. 核心数据：中间表示全部是文件

| 文件 | 写入者 | 读取者 | 内容 |
|---|---|---|---|
| `reference-profile.json` | 分析流水线 | 规范、生成 | 参考视频的风格分布 |
| `spec.json` | 由 profile 与默认值合成 | 校验器、评分卡 | 本项目实际生效的 H/M 阈值 |
| `voice.json` | 音频模块 | 分镜、校验 | 音频路径、逐词时间戳、句子边界 |
| `storyboard.json` | agent | 校验、构建、评审 | 镜头、转场、意图声明、节拍、素材引用（见 §5） |
| `scorecard.json` | 评审 | agent、编排内核、素材库 | 硬约束结果、指标、评判意见、问题归因到素材 |
| `project.json` | 编排内核 | 全部 | 状态机状态、轮次、成本、锁定的素材版本 |
| `asset-lock.json` | 素材库服务 | 渲染、评审 | 本项目引用的全部素材 id 和版本 |
| `decisions.jsonl` | agent | 人、下一轮 agent | 关键选择和理由 |

规范本身也是数据：同一个项目换一套 profile，就换了一套标准。

## 3. 两条流水线

### 3.1 分析流水线

```
参考视频 → video_analyze ─(测量内核)→ measures/shots + 拼图
        → segments_label（客户端模型做选择题）→ profile_build → reference-profile
        → recipe_add / replica → 进入素材库（draft）
        → reconstruct_eval（重建测试，检验提取结果）
```

详见 [01-reference-analysis.md](01-reference-analysis.md)。

### 3.2 生成流水线：状态机

```
created → scripted → voiced → storyboarded ⟂ → building → reviewing ⇄ (≤3轮) → previewed ⟂ → final
                                       ⟂ = 人工确认
```

| 阶段 | 工具 | 闸门 |
|---|---|---|
| scripted | `project_create`、`script_set` | 文案非空，字数与预计时长匹配 |
| voiced | `voice_synthesize` 或 `voice_align` | 有逐词时间戳，响度可测 |
| storyboarded | `asset_search`、`storyboard_validate` | 时间覆盖、意图字段齐全、引用的素材存在且级别达标，然后人工确认 |
| building | `scene_packet`、`scene_scaffold`、`asset_use`、`scene_check` | 每个镜头通过静态检查 |
| reviewing | `scene_snapshot`、`scene_inspect`、`scene_measure`、`review_record` | 硬约束全过且无 P0；超过 3 轮转人工 |
| previewed | `render_preview` | 低清整片，人工确认 |
| final | `render_final`、`asset_promote`（可选） | 规格与响度复检，导出成片 |

顺序不对时工具直接拒绝，并在返回中给出当前阶段和下一步应调用的工具。

## 4. 能力层

### 4.1 渲染引擎：一个 Remotion 工程

```
engine/
  src/theme/        # 设计变量：color / type / space / motion
  src/runtime/      # Root.tsx：读取 storyboard.json + asset-lock.json，动态生成时间轴
                    # 支持镜头间转场对象、音画错位（J-cut / L-cut）
  src/bridge/       # 渲染时导出元素包围盒与动画意图，供评审精确测量
projects/<name>/scenes/s03.tsx   # agent 写的镜头
```

- 引擎只有一份，项目作为数据和镜头代码挂入。
- 积木、效果、转场等代码组件**不在 engine 里，在 `library/` 里**，按版本引用（见 [03-asset-library.md](03-asset-library.md)）。
- ESLint 限制镜头文件只能 import `theme`、`library` 中已锁定的组件和 `runtime` 提供的元件；禁止写死颜色、字体、时长、缓动数值。

### 4.2 测量内核（Python）

```
measure/  probe  cuts  asr  ocr  color  flow  track  audio  layout
```

- 同一套函数分析参考视频和检测自己的成片，输出同一种 schema。
- 自己的成片额外有 `bridge` 导出的包围盒和意图，精度更高；两边统一换算成无量纲指标（如"占画面高度的比例"）。

### 4.3 音频（Python）

TTS 适配（只接一家，可配置）、whisper 逐词对齐、混音（人声出现时压低配乐）、响度规范化。

### 4.4 素材库服务（TS）

清单管理、检索（标签 + 全文 + CLIP 向量）、入库处理、版本锁定、质量分级、生成式 API 调用（预算闸门 + 内容哈希缓存）。详见 [03-asset-library.md](03-asset-library.md)。

### 4.5 进程模型

- TS server 是唯一常驻进程。
- Python 测量与音频以**子进程**调用，每次传入一份 JSON、返回一份 JSON，不常驻服务；重计算结果走内容哈希缓存。
- 若后续模型加载开销过大（如 OCR、ASR 模型冷启动），再改为常驻本地服务，接口不变。

## 5. 分镜格式（storyboard.json）

```jsonc
{
  "version": 1,
  "canvas": { "w": 1080, "h": 1920, "fps": 30 },
  "style": "preset/style/dark-tech@1.0",
  "shots": [
    {
      "id": "s03",
      "start": 6.40, "end": 9.15,                 // 画面区间
      "audio_offset": { "in": 0, "out": 0 },      // 音频相对画面的提前/延后（J-cut/L-cut）
      "text": "用户留存率提升了 37%",
      "block": "block/stat-punch@1.2",            // 或 "custom"：由 agent 写 scenes/s03.tsx
      "params": { "value": 37, "unit": "%", "caption": "30 日留存" },
      "effects": ["effect/soft-glow@1.0"],
      "intent": {
        "focal": "数字 37%",
        "metaphor": "growth-rise",
        "emphasis_words": ["37%"],
        "motion": "数字计数到 37 后弹一下，说明文字随后入场"
      },
      "beats": [{ "t": 7.10, "word": "37%", "event": "count-end", "sfx": "sfx/hit-short@1.0" }]
    }
  ],
  "transitions": [
    {
      "between": ["s03", "s04"],
      "asset": "transition/mask-wipe@1.1",
      "duration_s": 0.4,
      "technique": "technique/match-cut@1.0"     // 声明剪辑手法后，校验器检查其约束
    }
  ],
  "music": { "asset": "music/pulse-120bpm@1.0", "duck_db": 12 }
}
```

## 6. 关键设计点

1. **长任务用 job 模式。** 渲染、ASR、分析立即返回 `job_id`，客户端用 `job_wait` / `job_status` 查询，期间通过 MCP progress 通知汇报进度。
2. **不依赖客户端能否并行。** `scene_packet(id)` 返回自包含任务包（意图、可用素材文档、主题、相邻镜头截图），能并行的客户端分发给子 agent，不能的顺序执行，结果一致。
3. **内容哈希缓存。** TTS、ASR、生成式镜头、单帧渲染、测量结果都以输入哈希为键缓存，只重算改动的部分。
4. **规范与工作流作为 MCP resources / prompts 暴露。** `docs/`、素材文档、当前项目 `spec.json` 作为 resources；工作流作为 prompt（如 `/make-video`）。
5. **人工改动感知。** `project_status` 告诉 agent 自上次之后人改了哪些文件。
6. **问题归因到素材。** 评分卡里的每个问题记录涉及的素材 id，用于素材质量分级。
7. **评测是一等公民。** `evals/briefs/` 固定标准需求，`evals/preferences.jsonl` 记录人工 A/B，`harness_eval` 一键回归。

## 7. 仓库结构

```
video-harness/
  server/        # TS：MCP 网关 + 编排内核 + 校验器 + 素材库服务
  measure/       # Python：测量内核（分析与评审共用）
  audio/         # Python：TTS 适配、对齐、混音
  engine/        # Remotion 工程：theme / runtime / bridge
  library/       # 素材库：代码组件、预设、手法、媒体清单（进 git）
  docs/          # 设计文档，同时作为 MCP resources
  evals/         # 标准需求、偏好记录、回归结果
  analysis/      # 参考分析结果（大文件不进 git）
  projects/      # 每条视频的工作目录（不进 git）
  blobs/         # 大文件，按 sha256 存放（不进 git）
  cache/         # 内容哈希缓存（不进 git）
```

## 8. 构建顺序

按"最快形成闭环"排序：

1. **测量内核 + `video_analyze`**：能分析参考视频，并完成测量层准确率验证（01 · E1）。✅ 见 `measure/`、`analysis/chaping/REPORT.md`。
2. **素材库最小版 + 引擎最小版**：清单格式、`asset_search` / `asset_use`；theme + 3 个积木；runtime 能读分镜。✅ 见 `library/`、`engine/`、`examples/battery-80`。
3. **编排内核 + 生成流水线**：从文案到成片跑通，硬约束先做 H1、H2、H3、H11。
4. **评审闭环**：拼图、`scene_inspect`、成片测量、评分卡、问题归因。
5. **重建测试 + 沉淀**：两条流水线接通；`asset_promote` 让好镜头回流素材库。
