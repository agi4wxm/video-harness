# video-harness

面向**口播 MG 视频**的视频制作 harness：以代码生成视频为主（3D 场景、数据可视化、各类 MG 效果），少量镜头调用生成式模型 API；能力通过 **MCP** 暴露，不绑定任何一家 agent。

## 核心问题

harness 的价值集中在两件事上，它们是同一个闭环的两端：

1. **参考分析** —— 从别人的好视频里提取可借鉴、可执行的东西，并能评估提取得对不对。见 [docs/01-reference-analysis.md](docs/01-reference-analysis.md)。
2. **质量规范** —— 把"高质量"量化为可校验的规范，并让 agent 稳定达到。见 [docs/02-quality-spec.md](docs/02-quality-spec.md)。

```
参考视频集 ──分析──▶ reference-profile（分布）+ 配方卡片 + 复刻积木
                          │
                          ▼
             质量规范 = 硬约束 + 落在参考区间内的指标 + 评判清单
                          │
                          ▼
    agent 生成 ──测量──▶ 评分卡（与参考的差距）──▶ 修复 / 人工 A/B ──▶ 修订规范
```

分析参考视频和检测自己的成片**使用同一套测量代码**，两边的数字才能直接比较。

## 已确定的技术决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 渲染引擎 | Remotion（唯一） | `@remotion/three` 做确定性 3D；React + d3 做数据可视化；TS 类型检查可作第一道关卡；所有镜头放在同一工程、共用 theme，风格一致；`@remotion/renderer` 可在 Node 中直接调用 |
| 对外接口 | MCP Server（TypeScript） | 不绑定 agent；工作流说明、规范通过 MCP prompts/resources 暴露；截图以 image content 返回，供任意能看图的模型评审 |
| 职责划分 | 创意交给 agent，流程与质量判定写在代码里 | 只靠 prompt 调度的流水线不可复现、难以续跑 |
| 生成式镜头 | 少量，作为素材嵌入时间轴 | 预算闸门 + 内容哈希缓存 + 来源记录 |

## 文档

- [docs/01-reference-analysis.md](docs/01-reference-analysis.md) —— 参考视频分析：提取什么、怎么提取、怎么评估
- [docs/02-quality-spec.md](docs/02-quality-spec.md) —— 质量规范：硬约束、工艺指标、评判清单，以及如何让 agent 达到
