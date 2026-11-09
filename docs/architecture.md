# 架构

> 一个 skill（流程与规范）+ 一个确定性 CLI（`vh`，流程与闸门）+ 项目文件（所有中间结果）。画面由场景图描述、由同一个渲染器画出；分析参考视频和检测成片用同一套测量代码。

## 1. 分层

```
┌──────────────────────────────────────────────────────────────────┐
│ Agent（Claude Code / Codex / Cursor …）                          │
│ 写简报、文案、节拍分镜、本地镜头代码；看图复核；与用户确认          │
│ 读：skills/video-harness/SKILL.md + references/（按需）            │
└───────────────┬───────────────────────────────┬──────────────────┘
                │ shell：vh <cmd>                │ 无 shell：MCP（packages/mcp，转发 vh）
┌───────────────▼───────────────────────────────▼──────────────────┐
│ packages/cli（vh）：状态推导 · 闸门 · 配音 · 预渲染 · 渲染 · 复核 · 比对 · 合成评测 │
├───────────────────────┬──────────────────────┬───────────────────┤
│ packages/core（纯函数）│ packages/runtime      │ analyze/（Python） │
│ 场景图 · 设计包 · 动效 │ Remotion 合成器       │ 版式 · 切点 / 节拍 │
│ 积木 · schema · 校验   │ 场景图 → SVG 渲染器   │ 旁白锚定 · 调色板  │
│ （Node 和浏览器共用）  │ 转场 · 音频 · 渲染    │ rea-video 合并     │
└───────────────────────┴──────────────────────┴───────────────────┘
                项目目录（文件即接口，状态由文件推导）
```

| 谁 | 做什么 | 不做什么 |
|---|---|---|
| Agent | 所有创意决定；所有需要"看"的判断；与用户沟通 | 不决定流程顺序，不判定是否合格 |
| `vh` | 判定当前阶段与下一步；闸门；确定性的计算、渲染、测量 | 不调用 LLM / VLM，不做审美判断 |
| 用户 | 确认简报、确认节拍表、复核 3 轮后仍有 P0 时拍板 | — |

`vh` 唯一的外部付费调用是 ElevenLabs 配音，默认只预估，`--yes` 才合成。

## 2. 项目文件

| 文件 | 写入者 | 内容 |
|---|---|---|
| `vh.json` | `vh new` / agent | 画布（默认 1920×1080 @30）、设计包、语言、配音设置 |
| `brief.md` | agent，用户确认 | inputs / direction（含 Banned）/ structure / build / gotchas / start；`status: approved` |
| `script.md` | agent | 旁白；空行分段，`[pause n]` 额外停顿 |
| `voice.json` + `public/vh/voice.wav` | `vh voice` | 逐词时间、语句、停顿、文案哈希（文案改了即过期） |
| `storyboard.json` | agent，用户确认 | 分镜 v2：镜头（时间、章节、转场、场景引用）→ 节拍（时间、旁白、视觉想法、焦点、母题）；语义色；母题 |
| `shots/` | agent | 本地镜头：`*.ts`（场景图）、`*/index.html`（seek(t) 网页）、`*.tsx`（Remotion 组件） |
| `.vh/` | `vh` | 校验结果、html 预渲染哈希、渲染 entry（派生，不进 git） |
| `renders/` | `vh render` / `vh stills` | 预览、成片、单帧拼图 |
| `review/` | `vh review` / agent | `tasks.json`、`answers.json`、`scorecard.json`、`compare.json` |

## 3. 场景图：一份描述，三处使用

积木和 `local` 镜头都是纯函数 `timeline(params, ctx) → SceneFrame`（`packages/core/src/types.ts`）：

- **渲染**：runtime 用一个 SVG 渲染器画场景图（文字、矩形、椭圆、路径描线、小人、参数化角色、渐变、辉光、虚拟相机、视差、暗角、颗粒）。
- **校验**：`vh check layout` 在 Node 里每 0.1s 求值一次，直接检查安全区、文字重叠、字号、对比度、在屏时长、僵帧——不需要渲染，也不需要 OCR。
- **真值**：`vh eval synth` 用同一份场景图导出切点、转场、文字出现时刻，作为分析算法的评测真值。

动效数学全部是闭式解（cubic-bezier、弹簧阶跃响应、带种子的眨眼时刻表、关键帧），任意顺序求任意帧都一致；这就是 `seek(t)` 约定在代码里的实现。html 镜头用同一约定（`window.__vh.seek(t)`），由 `vh build` 逐帧截图预渲染，可选导出 `inspect(t)` 纳入校验。

## 4. 状态推导与闸门

`vh status` 依次检查：简报（含人工确认）→ 文案 → 配音（是否过期）→ 分镜（含人工确认）→ 构建（确定性、html 预渲染新鲜度）→ 版面 → 预览新鲜度 → 复核（scorecard 通过且晚于分镜）→ 成片（规格、响度）。第一个不通过的就是当前阶段，并给出下一步命令。没有常驻进程、没有数据库；用户手改任何文件，下一次 `vh status` 就反映出来。

`vh render --final` 会先跑全部闸门；`--force` 只用于调试。

## 5. 进程模型

- `vh` 是普通命令行（Node + tsx 直接运行 TS 源码，无构建步骤），结果 `--json` 可机读，`vh check` 打印 `VH_CHECK=PASS|FAIL`。
- 渲染：每次生成项目 entry（静态导入本地镜头）→ `@remotion/bundler` 打包 → `@remotion/renderer` 渲染。
- 分析：`vh compare` 以子进程调用 `analyze/.venv` 里的 `python -m vh_analyze`；rea-video 作为可选的外部命令。
- 缓存：TTS（`~/.cache/video-harness/tts`，按文本 + 声音 + 设置哈希）、ASR（按文件哈希）、html 预渲染（按镜头目录内容哈希）。

## 6. 与参考项目的关系

| 来源 | 借鉴 |
|---|---|
| rea-video | skill 在前 + 确定性 CLI；看图复核的 tasks / answers 协议；证据与"待确认"纪律；调参集 / 留出集与如实记录；分析底座 |
| create-vibe-motion / -3d | timeline（纯函数）与 Scene（只负责画）分离；参数清洗；`window.__…` 帧导出约定 |
| awesome-opus5-5-videos | 简报六段格式；`seek(t)` 确定性渲染；按题材的禁用清单；"先给节拍表再写代码" |
| auto-motion | 每镜独立、执行约定固定而创意自由；端到端客观校验（规格、时长）；机器可读的阶段输出 |
| vibe-motion-skills（已停更） | 反面教训：一堆松散的 skill 难以维护 → 一个 skill + 按需 references |
