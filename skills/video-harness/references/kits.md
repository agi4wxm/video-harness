# 积木（kit）

积木 = 参数 schema + 纯函数 `timeline(params, ctx) → 场景图`。用 `vh kits` 看列表，`vh kits show <id>` 看参数（JSON Schema）和示例，`vh kits preview <id> [--chapter night]` 渲染示例拼图。

| 积木 | 用来画 | 时长 |
|---|---|---|
| `kit/title-card` | 章节标题卡：小标题 + 大标题 + 描线下划线 + 光球 / 放射光 | 1.6–4.5s |
| `kit/stat-crowd` | 人群单位图：一群小人里有多少变色，右侧大数字同步计数；比例、占比、生存率 | 2.5–7s |
| `kit/process-diagram` | 节点 + 箭头 / 流动粒子 + 分步揭示 + 脉冲强调；因果、流程、物质流动 | 2–8s |
| `kit/character-scene` | 插画场景（视差远近景）+ 参数化角色（呼吸、眨眼、表情切换）+ 道具 + 指向标签 + 虚拟相机 | 2.5–9s |
| `kit/scale-zoom` | 尺度穿越：一镜到底的指数缩放（身体 → 器官 → 细胞 → 分子） | 3–12s |

## 选择

- 先看节拍的 `idea`，找能**直接画出这个想法**的积木；参数调不出来就写本地场景图，不要硬套。
- 同一积木连续使用会显得模板化：相邻镜头换积木或换章节色。
- 时间参数（`at`、`steps[].at`、`camera[].at`、`expressions[].at`）都是**镜头内秒数**，对齐到节拍：`节拍 t − 镜头 start`。
- 颜色参数只写 token：调色板角色（`bg bgDeep surface ink inkMuted accent accent2 positive negative glow`）或分镜 `semantic` 里的名字。

## 新增积木

可复用的本地镜头做好后可以升级为积木：见仓库 `docs/dev/kits.md`（写 `defineKit` 文件、加示例、跑 core 测试——示例必须通过版面校验）。
