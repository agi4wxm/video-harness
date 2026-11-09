# 素材库系统（asset-library）

video-harness 的素材库子项目：把"做视频需要的一切"分类、存储、检索、审查，并提供 macOS 桌面应用。

> **完备性**：任何视频里的任何构成要素，都能用 7 个互斥且穷尽的问题归到 **8 大类 · 46 小类** 中的一个（见 [docs/taxonomy.md](docs/taxonomy.md)）。测试里有来自 13 种题材的 118 个真实要素样例，每个小类都至少有一个要素落入。

| 大类 | 存什么 |
|---|---|
| 知识素材 `knowledge` | 资料来源、事实与数据点、引语、概念与类比、人物与机构、事件 |
| 风格 `style` | 风格包、色板、字体排版规范、版式与构图、动效语言、调色与质感 |
| 画面内容 `content` | 3D 模型、3D 场景、材质与贴图、矢量图形、图表组件、界面与面板、位图图像、视频片段、预制动画、文字元素、字体、标识 |
| 数据 `data` | 仿真、数据集、公式、地理数据 |
| 呈现效果 `effect` | 元素动效、文字动效、数据可视化动效、镜头运动、转场、叠加与合成、3D 表现手法、粒子与模拟特效、后期处理 |
| 声音 `sound` | 配音、配乐、音效、环境声 |
| 结构 `structure` | 叙事骨架、段落模式、节奏模板、剪辑手法 |
| 拆解记录 `reference` | 参考视频的完整拆解（把拆出来的素材串起来） |

## 目录

```
asset-library/
├── packages/core/      内核：分类体系、条目 schema、存储（内容寻址）、校验、索引与检索、审查、归类、本地 API
├── packages/cli/       lib 命令行
├── apps/desktop/       桌面应用：Electron + React（macOS 打包配置在这里）
├── library/            素材库数据（档案进 git；blobs/ 大文件与 index/ 不进 git）
├── scripts/            seed-hoverslam.ts：用第一条参考片的拆解生成首批条目
└── docs/               design.md（设计）、taxonomy.md（分类体系，自动生成）、mac-app.md（打包）
```

## 快速开始

```bash
cd asset-library
pnpm install
pnpm lib types                      # 看分类体系
pnpm lib ls                         # 列出素材
pnpm lib classify 右侧半透明遥测面板    # 归类建议；不带参数则走决策树问答
pnpm lib serve                      # 本地 API + 网页界面（先 pnpm build 一次）
```

首批条目来自参考片《汽车飞出高架，怎样才能软着陆？》的拆解，共 80 条（全部为草稿，等待审查）。它们的预览是参考片的低清关键帧，**不进 git**；本地有参考视频时运行：

```bash
node --import ./packages/core/node_modules/tsx/dist/esm/index.mjs scripts/seed-hoverslam.ts --video <参考视频.mp4>
```

## 桌面应用

```bash
pnpm dev          # 开发：vite + electron
pnpm dist:mac     # 打包 .dmg / .zip（arm64 + x64）→ apps/desktop/release/
```

详见 [docs/mac-app.md](docs/mac-app.md)。

## 开发

```bash
pnpm typecheck && pnpm test
pnpm lib lint     # 校验素材库：格式、文件、依赖、审查条件、来源与授权
```

改了分类体系后运行 `pnpm lib docs --out docs/taxonomy.md` 重新生成文档。
