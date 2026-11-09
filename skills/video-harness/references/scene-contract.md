# 镜头约定（seek(t)）

所有镜头的画面都只由时间决定，可以按任意顺序求任意一帧。三种自写镜头：

## 1. `kind: "local"` —— 场景图（首选）

`shots/<id>.ts` 导出与积木同形的纯函数：

```ts
import type { KitCtx, SceneFrame } from "@video-harness/core";   // 只 import 类型

export function timeline(params: { label?: string }, ctx: KitCtx): SceneFrame {
  const { t, dur, W, H, d, seed, beats } = ctx;    // t：镜头内秒数；d：设计变量；seed：确定性随机种子
  return {
    bg: { linear: [d.palette.bg, d.palette.bgDeep], angle: 180 },
    camera: { x: W / 2, y: H / 2, zoom: 1 + 0.05 * t },  // 可选：虚拟相机
    els: [
      { type: "ellipse", id: "cell", x: 800, y: 400, w: 300, h: 300, fill: { radial: [d.color("surface"), d.color("accent")] }, glow: d.glow, role: "focal" },
      { type: "text", id: "label", text: "cell", font: "sans", size: d.type.label, weight: 700, color: d.color("ink"), x: 880, y: 720, w: 140, h: 44, role: "label" },
    ],
  };
}
```

- 元素类型：`text`、`rect`、`ellipse`、`path`（`d` 相对元素框；`progress` 0–1 描线）、`figure`（小人）、`character`（参数化角色：`expression`、`blink`、`breathe`、`look`）。
- 通用字段：`opacity`、`scale`、`rotate`、`z`、`glow`、`layer: "screen"`（不受相机影响）、`role`（`title/label/number/body/caption/focal/decor/character`）、`on`（文字所在背景色，用于对比度校验）。
- 文字框 `w/h` 要接近真实大小（`@video-harness/core` 的 `textBox()` 可算；不 import 时按 字数 × 字号 × 0.55 估）。
- 好处：`vh check layout` 直接读场景图做安全区、重叠、字号、对比度、在屏时长、僵帧校验，不需要渲染。
- 不要 import 运行时代码（除了类型），这样 `vh` 能在 Node 里求值。

## 2. `kind: "html"` —— 任意网页技术（Canvas / Three.js / GSAP / SVG）

`shots/<id>/index.html` 实现：

```js
window.__vh = {
  isReady: () => true,               // 资源加载完成后返回 true（可返回 Promise）
  seek: (t) => draw(t),              // t：镜头内秒数；同步（或 await）画完这一帧
  inspect: (t) => [ /* 可选：返回该时刻的场景图元素，纳入版面校验 */ ],
};
```

- URL 参数：`?w=&h=&fps=&duration=`。
- `vh build` 用无头浏览器逐帧调用 `seek(t)` 截图，编码成 `public/vh/shots/<id>.mp4`，内容哈希缓存。
- GSAP：建一个 `paused: true` 的时间线，`seek` 里 `tl.seek(t)`；Three.js：在 `seek` 里设置相机 / 物体 / `mixer.setTime(t)` 再 `renderer.render()`。
- 素材放在镜头目录里用相对路径引用；不许联网加载。

## 3. `kind: "react"` —— Remotion 组件

`shots/<id>.tsx` 默认导出组件，用 `useCurrentFrame()`；可用 `@remotion/three` 等。**没有场景图，版面校验跳过**，能用 local 就用 local。

## 禁止（`vh check build` 静态扫描）

`Math.random`（用 `ctx.seed` 派生）、`Date.now` / `new Date` / `performance.now`、`fetch` / XHR / WebSocket、`setTimeout` / `setInterval`、`requestAnimationFrame` 驱动动画、CSS `transition` / `animation`、写死 hex 颜色（local / react 里用 `ctx.d.color(token)`）。
