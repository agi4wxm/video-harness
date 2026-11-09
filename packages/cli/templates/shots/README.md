# 本地镜头

积木不够用时在这里写专门的镜头，在 storyboard.json 里引用：

- `kind: "local"` + `entry: "shots/<id>.ts"`：导出 `timeline(params, ctx) → SceneFrame`，与积木同形，由 runtime 统一渲染，版面校验和评测真值都能用。**首选。** 示例：`example-local.ts`。
- `kind: "html"` + `entry: "shots/<id>/index.html"`：任意 HTML / Canvas / Three.js / GSAP，实现 `window.__vh = { isReady(), seek(t), inspect?(t) }`，`vh build` 逐帧预渲染。示例：`example-html/index.html`。
- `kind: "react"` + `entry: "shots/<id>.tsx"`：默认导出 Remotion 组件（可用 `@remotion/three` 等），没有场景图，版面校验跳过。

所有镜头都只能由时间 t 决定画面：不许 Math.random（用 ctx.seed）、Date.now、计时器、CSS 动画、运行时网络请求。颜色用 `ctx.d.color("accent")` 这类 token。
