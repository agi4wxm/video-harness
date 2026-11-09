# video-harness

用**代码**做讲解视频的 harness：横屏 MG / 插画科普，画面全部由 `seek(t)` 确定性渲染，配音用 ElevenLabs，不使用生成式视频。

**形态**：一个给 agent 用的 skill + 一个确定性 CLI（`vh`）+ 一组项目文件约定。创意交给 agent，流程顺序、闸门和质量判定写在 `vh` 里；MCP 只是给没有 shell 的客户端的薄适配器。

```
参考视频 ──拆（rea-video + vh_analyze）──▶ 简报 ⟂ ──▶ 文案 ──▶ 配音（ElevenLabs）
                                                                   │
            ┌──────────────────────────────────────────────────────┘
            ▼
     节拍分镜 ⟂（每拍先写视觉想法）──▶ 镜头：积木 / 本地场景图 / html / react
            │                                   │
            ▼                                   ▼
     vh check（时间覆盖、确定性、安全区、重叠、字号、对比度、僵帧……直接读场景图）
            │
            ▼
     预览 ──▶ 看图复核（tasks / answers，≤3 轮）──▶ 成片（规格 + 响度）──▶ 再拆比对（诊断）
                                                    ⟂ = 人工确认
```

## 快速开始

```bash
bash scripts/install_skill.sh        # 依赖 + vh 命令 + Python 分析环境 + skill 链接
vh new my-video && cd my-video
vh status                            # 每一步都先看这个
```

对 agent 说"用 video-harness 做一条讲解 X 的视频"，它会按 [skills/video-harness/SKILL.md](skills/video-harness/SKILL.md) 走完流程。示例项目：[examples/sky-blue](examples/sky-blue/)（34 秒，包含积木、本地场景图、html 镜头三种画面）。

## 仓库结构

| 路径 | 内容 |
|---|---|
| `skills/video-harness/` | 给 agent 的 skill：流程 + 按需读取的 references（简报、配音、分镜、积木、镜头约定、设计体系、质量、复核、拆参考、反廉价、品味） |
| `packages/core/` | 纯函数内核：场景图类型、设计包、动效数学（缓动 / 弹簧闭式解 / 眨眼呼吸）、5 个积木、项目文件 schema、inspect 与版面校验。不依赖浏览器 |
| `packages/runtime/` | Remotion 合成器：统一的场景图 → SVG 渲染器、转场、html 镜头视频、配音与配乐（ducking）、Node 端渲染 |
| `packages/cli/` | `vh`：new / status / check / voice / build / stills / render / review / compare / kits / eval |
| `packages/mcp/` | 薄 MCP 适配器：工具一一对应 `vh` 命令 |
| `analyze/` | Python 分析层（rea-video 之上）：版式感知切镜、视觉节拍、旁白锚定、调色板、多片聚合、合成集打分 |
| `examples/` | 示例项目 |
| `eval/` | 合成评测集（真值来自场景图）、反面样本、`RESULTS.md` |
| `docs/` | 给人看的文档：架构、决策记录、路线图；`docs/dev/` 是开发文档 |

## 文档

- [docs/architecture.md](docs/architecture.md)：分层、文件约定、场景图、状态推导、进程模型
- [docs/decisions.md](docs/decisions.md)：关键决策与理由（为什么是 skill + CLI、为什么不靠统计区间、为什么纯代码）
- [docs/roadmap.md](docs/roadmap.md)：已完成与待做
- [docs/dev/kits.md](docs/dev/kits.md)：怎么写积木 · [docs/dev/evaluation.md](docs/dev/evaluation.md)：评测纪律

## 开发

```bash
pnpm install
pnpm typecheck && pnpm test                         # 四个包
analyze/.venv/bin/python -m pytest -q analyze/tests
```

参考与致谢：[rea-video](https://github.com/JuneYaooo/rea-video)（分析底座与复核协议，Apache-2.0）、create-vibe-motion（timeline / Scene 分离）、awesome-opus5-5-videos（简报格式、`seek(t)` 约定、禁用清单）、auto-motion（每镜独立执行约定、端到端客观校验）。
