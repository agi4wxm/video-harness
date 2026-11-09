# 写一个积木

积木在 `packages/core/src/kits/<name>.ts`，用 `defineKit` 定义：

```ts
export const myKit = defineKit({
  id: "kit/my-kit",
  title: "中文名",
  summary: "画什么、用来讲什么（agent 靠这句选积木）",
  tags: { shot_type: ["diagram"], metaphor: ["flow-path"] },   // 与分析词表共用
  duration: [2, 6],                                            // 推荐时长（秒）
  schema: z.object({ /* 参数；颜色参数用 z.string().default("accent")，只接受 token */ }),
  examples: [{ name: "示例", duration: 4, params: { /* … */ } }],
  timeline(p, { t, dur, W, H, d, seed, beats }) {
    return { bg: …, els: [ … ], camera?: …, vignette: d.texture.vignette, grain: d.texture.grain };
  },
});
```

然后加到 `packages/core/src/kits/index.ts`。

## 规则

1. **纯函数**：只用参数和 `ctx`；随机数用 `seeded(ctx.seed)`；不读时间、不访问 DOM。
2. **设计变量**：颜色 `d.color(token)` / `d.palette.*`；字号 `d.type.*`；动效 `d.motion.*`；安全区 `d.safe`。不写 hex（`draw.ts` 的 `tint()` 可以在 token 之间混色）。
3. **文字用 `text()` 助手**，它给出与渲染一致的文字框；需要指定背景时传 `on`，对比度校验才准确。
4. **始终有生命**：静止的画面也要有呼吸、漂移或缓慢的相机运动（H8）。
5. **示例必须通过校验**：`pnpm --filter @video-harness/core test` 会对每个示例跑分镜校验和版面校验（安全区、重叠、字号、对比度、僵帧）。
6. 看效果：`vh kits preview kit/my-kit [--chapter night]`。
7. 改了积木或渲染器：跑合成评测并更新 `eval/RESULTS.md`（见 [evaluation.md](evaluation.md)）。
