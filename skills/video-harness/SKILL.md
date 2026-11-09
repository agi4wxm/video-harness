---
name: video-harness
description: 用代码生成讲解视频（横屏 MG / 插画科普）：拆参考视频 → 创意简报 → 配音（ElevenLabs）→ 节拍分镜（先写视觉想法）→ 积木 / 本地场景图 / html 镜头 → 版面校验 → 看图复核 → 成片 → 与参考比对。所有画面由时间 t 决定（seek(t)），不使用生成式视频。触发词：做视频、讲解视频、科普动画、MG 动画、口播视频、explainer video、motion graphics、Remotion 视频、video-harness、vh。
---

# video-harness

**一句话**：创意交给你，流程和质量判定交给 `vh`。每一步的产物都是项目目录里的文件，`vh status` 根据这些文件告诉你现在在哪一步、下一步做什么。

## 开工

1. 第一次使用先看 [references/setup.md](references/setup.md)（安装 `vh`、Python 分析环境、ElevenLabs key）。
2. 新项目：`vh new <dir>`；已有项目：`cd <dir> && vh status`。**每次开工、每做完一步，都先跑 `vh status`。**
3. 用户给了参考视频：先按 [references/analysis.md](references/analysis.md) 拆参考（rea-video + `vh_analyze`），拆的结论写进简报。

## 流程（顺序不能跳；带 ⟂ 的必须等用户确认）

| 阶段 | 你要做的 | 读 | 闸门 |
|---|---|---|---|
| 简报 ⟂ | 写 `brief.md`：inputs / direction（含 Banned 清单）/ structure / build / gotchas / start | [brief.md](references/brief.md)、[anti-cheap.md](references/anti-cheap.md)、[taste/](references/taste/) | `vh check brief`；用户确认后 `status: approved` |
| 文案 | 写 `script.md`：短句，段落之间留停顿 | [voice.md](references/voice.md) | — |
| 配音 | `vh voice` 先预估字符数 → **告诉用户消耗多少** → `vh voice --yes` | [voice.md](references/voice.md) | `vh check voice` |
| 分镜 ⟂ | 按 `voice.json` 的语句时间写 `storyboard.json`：每个节拍先写 **idea（视觉想法）**，再选积木 / 本地场景 | [storyboard.md](references/storyboard.md)、[kits.md](references/kits.md)、[design-system.md](references/design-system.md) | `vh check storyboard`；把节拍表给用户确认后 `approved: true` |
| 构建 | 积木不够时写本地镜头（local 场景图优先，其次 html / react）；`vh build` | [scene-contract.md](references/scene-contract.md) | `vh check build` |
| 版面 | 修到没有 error | [quality.md](references/quality.md) | `vh check layout` |
| 预览 | `vh render --preview`；`vh stills 1.2,5,9.5` 看关键帧 | — | — |
| 复核 | `vh review tasks` → **只看图**逐条填 `review/answers.json` → `vh review apply`；P0 清零才能出成片，修 3 轮仍有 P0 交给用户 | [review.md](references/review.md) | scorecard.pass |
| 成片 | `vh render --final`（自动再跑全部闸门）→ `vh check render` | [quality.md](references/quality.md) | 规格、响度 |
| 比对（可选） | `vh compare --ref <参考 analysis.json>` | [analysis.md](references/analysis.md) | 诊断，不是闸门 |

## 不能违反的规则

1. **只用代码生成画面。** 不调用图片 / 视频生成 API；插画、角色、场景都用场景图（SVG）、Canvas、Three.js 画。真实 logo / 产品图只能用用户提供的文件。
2. **画面只由时间 t 决定。** 不用 `Math.random`（用 `ctx.seed`）、`Date.now`、计时器、CSS 动画、运行时网络请求。
3. **颜色只用 token。** 积木参数里写 `accent`、`positive` 或分镜 `semantic` 里定义的语义色名，不写 hex。
4. **先想法后代码。** 每个节拍的 `idea` 要写"画什么具体的东西"，不是"展示信息"。写不出来就回到简报。
5. **付费步骤先预估。** `vh voice` 不带 `--yes` 只预估；合成前告诉用户字符数和剩余额度。
6. **不要自己判定"够好了"。** 闸门由 `vh check` 判，审美由复核 + 用户判。复核时用全新上下文（能开子 agent 就开），只看图和分镜，不看代码。
7. **省 token**：看 `vh status` / `vh check` 的摘要，不要整份读 `analysis.json`、`inspect` 输出；需要细节时用 `--json` 再挑字段。

## 交付

告诉用户：成片路径（`renders/final.mp4`）、时长、用了哪些积木和自写镜头、复核轮次与剩余 P1/P2、配音消耗的字符数、`vh compare` 的偏离项（如果做了）、还需要用户提供或决定的东西。
