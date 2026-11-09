# 示例：Why is the sky blue?

34 秒横屏讲解，用来演示完整流程和三种镜头：

| 镜头 | 实现 | 视觉想法 |
|---|---|---|
| s01 | `kit/character-scene`（蓝天章节、推镜、表情切换） | 小孩在山坡上看蓝天；"阳光是白的"时表情变惊讶 |
| s02 | `kit/title-card` | 问题卡 |
| s03 | `kit/scale-zoom`（night 章节） | 一镜到底：天空 → 空气 → 分子 |
| s04 | **local 场景图** `shots/scatter.ts` | 白光打到分子上四散；蓝光是红光的约 5 倍 |
| s05 | `kit/process-diagram` | 太阳 → 空气 → 眼睛，只有蓝色粒子流进眼睛 |
| s06 | **html 镜头** `shots/sunset/index.html`（Canvas） | 日落时光程变长，天空从蓝变红 |

```bash
cd examples/sky-blue
vh status
vh voice              # 配音已缓存时免费重建 public/vh/voice.wav；没有缓存会先预估字符数
vh build              # 预渲染 html 镜头
vh render --preview   # 或 --final
```

`renders/`、`public/vh/`、`.vh/` 是派生文件，不进 git；成片 `final.mp4`（1920×1080，33.6s，-14 LUFS），`final.png` 是复核用的节拍关键帧拼图（复核 2 轮：第 1 轮 2 个 P1 已修）。配音：ElevenLabs George（`eleven_multilingual_v2`），9 句、454 字符。
