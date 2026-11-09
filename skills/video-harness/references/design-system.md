# 设计体系

设计包定义"这条片子的世界长什么样"。内置 `illustrated`（插画世界）；项目里放 `design.json` 并在 `vh.json` 里写 `"design": "./design.json"` 可以自定义（schema 见 `packages/core/src/design.ts`）。

## 内置 `illustrated`

- **造型**：扁平矢量、无描边、圆角几何；质感来自柔和渐变和辉光，不来自纹理。
- **章节色板**：`day`（明亮奶油底，默认）/ `night`（深紫底，用于"进入内部 / 微观 / 机制"）/ `sepia`（棕褐 + 颗粒 + 暗角，用于历史闪回、日落、回忆）。**换章节就换整套颜色**，观众凭颜色知道"到了另一个部分"。
- **调色板角色**：`bg bgDeep surface ink inkMuted accent accent2 positive negative glow`。积木和本地镜头只引用角色名。
- **语义色**：在分镜 `semantic` 里把实体固定到颜色（`"drug": "#57D88C"`），全片不变。语义色可以是 hex 或调色板角色。
- **字号**（占画面高度）：kicker 2.8%、label 3.2%、caption 3.6%、body 4%、title 8.5%、display 12%、number 17%。
- **动效变量**：入场 0.55s、逐个间隔 70ms、缓出 `cubic-bezier(0.22,1,0.36,1)`、弹簧 pop（170/14/1）；待机呼吸 0.32Hz，眨眼约每 3.4s。
- **安全区**：左右 5%、上下 6%。

## 规则

- 文字颜色在背景上的对比度：大字（≥ 5% 画面高）≥ 3，其余 ≥ 4.5（H6）。改设计包后跑 `pnpm --filter @video-harness/core test`。
- 底色明亮、彩度足够（讲解插画类画面彩度中位 ≥ 0.08）；灰暗低彩度是廉价感最大的单一来源（见 [anti-cheap.md](anti-cheap.md)）。
- 辉光只给"重要的东西"（药物、信号、答案），不要全屏发光。
