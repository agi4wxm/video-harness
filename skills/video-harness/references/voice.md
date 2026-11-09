# 文案与配音

## script.md

- 空行分段：段落之间的停顿（默认 0.75s）比句子之间（0.3s）长。可在 `vh.json` 的 `voice.pauses` 调。
- 单独一行 `[pause 1.0]`：额外停顿 1 秒（换章节、给画面留呼吸）。
- 以 `#` 或 `>` 开头的行不朗读。
- **句子要短**（讲解类横屏约 150 词 / 分钟）。每句话最好对应一个画面想法；长句拆开。
- 数字写成读出来自然的形式（"about five times"），画面上再用大字排版。

## 配音（ElevenLabs）

```bash
vh voice          # 只预估：多少句、多少字符要合成、剩余额度（不花钱）
vh voice --yes    # 合成：逐句请求 with-timestamps，内容哈希缓存，改一句只重合一句
```

- 默认声音 George（英式、讲故事），模型 `eleven_multilingual_v2`；在 `vh.json` 的 `voice` 里改 `voice_id` / `model_id` / `settings`。中文旁白用 multilingual 模型并换中文声音。
- 输出：`public/vh/voice.wav`（已规范到 -14 LUFS / -1.5 dBTP）和 `voice.json`（逐词时间、语句时间 `segments`、停顿 `pauses`）。
- 分镜的时间全部以 `voice.json` 为准：镜头和节拍落在语句开头或停顿里。
- 改了 `script.md` 后 `voice.json` 自动视为过期（`vh check voice` 会报）。
- **合成前把字符数告诉用户**；缓存在 `~/.cache/video-harness/tts/`，重新拼接不花钱。
