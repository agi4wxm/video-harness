# library · 素材库

设计见 [docs/03-asset-library.md](../docs/03-asset-library.md)。这里是**作者指南**：怎样新增一个素材。

## 目录

```
_sdk/          积木 SDK：主题、动效、段信息（所有代码素材只通过它拿设计变量）
blocks/        积木（整镜模板）
elements/      元件（版式模板等）
transitions/   转场
presets/       风格包 / 动效包（tokens.json）
media/         媒体：font、image……（< 1MB 的文件与 asset.yaml 放在一起；更大的放 blobs/<sha256>）
index.json     由 engine `npm run index` 生成，MCP server 用它检索；请勿手改
```

## 新增一个积木

1. 建目录 `blocks/<name>/`，放三个文件：
   - `schema.ts`：`export const schema = z.object({...})`。每个字段写 `.describe()`，agent 靠它理解参数；有默认值的字段用 `.default()`。
   - `index.tsx`：`export default` 一个 React 组件，props 即 `z.infer<typeof schema>`。
   - `asset.yaml`：清单（格式见 docs/03 §2），**至少一个 `examples`**，用于预览和校验。
2. 组件只能通过 `../../_sdk` 拿设计变量：
   - 颜色：`useColor("accent")` / `useTheme().style.color`；
   - 字号：`useFontPx("body")`（按画布高度换算）；
   - 动效：`useEnter()`、`useProgress()`、`usePop()`、`useStagger()`；
   - 段信息：`useSegment()` 给出内容区尺寸 `box`、段时长、节拍。

   不要写死颜色、字体、时长、缓动数值（规范 H3）。
3. 确定性（规范 H2）：所有状态由 `useCurrentFrame()` 计算；随机用 `seeded(n)`；不在运行时联网。
4. 排版防护（规范 H4 / H5）：文字必须放得下（参考 `title-kinetic` 的自动缩放），元素不出内容区（参考 `mg-diagram` 的 `geom()`），连线 / 标签不压字。
5. 在 `engine/` 运行 `npm run index`（校验清单、示例参数、依赖），再用 MCP `asset_preview` 看效果。
6. 新素材一律 `status: draft`。预览通过硬约束且人工看过后改为 `verified`；`golden` 由使用数据决定（docs/03 §4.2）。

## 现有素材（v0.1）

| id | 说明 | 对应参考集 |
|---|---|---|
| `block/title-kinetic` | 大字标题：逐字 / 逐行 / 弹出，强调词变色弹一下，自动缩放 | kinetic-text、scale 强调 |
| `block/mg-diagram` | 黑底图解：节点 + 连线 + 分步揭示 + 流动粒子 + 同形脉冲 | 黑底 MG 图解 40% |
| `block/footage-window` | 素材窗口：图片 / 视频 + 推拉平移 + 标注 + 高亮框 | 实拍素材 46% |
| `element/window-frame` | 版式：网格背景 + 窗口面板 + 窗内字幕条 + 底部话题栏 | 固定窗口模板（仅结构比例） |
| `preset.style/mono-window` | 色板、字号、版式比例 | reference-profile 9:16 |
| `preset.motion/standard` | 入场 0.43s、间隔 70ms、逐字 40ms、弹簧 | reference-profile 9:16 |
| `transition/fade`、`transition/push-up` | 入场方镜头的转场 | 滑入以"从下"最多 |
| `media.font/*` | Noto Sans SC、Inter、JetBrains Mono（OFL，npm 打包） | — |
| `media.image/phone-charging` | 演示图片（gpt-image-2 生成） | — |
