# 安装与环境

```bash
git clone https://github.com/agi4wxm/video-harness && cd video-harness
bash scripts/install_skill.sh      # 装依赖、把 vh 链到 ~/.local/bin、把 skill 链到各 agent 的 skills 目录
vh --help
```

需要：Node ≥ 22 + pnpm、ffmpeg、Python ≥ 3.10、Chromium（或 chrome-headless-shell；路径可用 `VH_BROWSER` 指定）。

## 密钥

- **ElevenLabs**（配音）：环境变量 `ELEVENLABS_API_KEY`；key 至少要有 Text to Speech、Voices: Read、Models: Read，查额度需要 User: Read。在云端沙箱里如果由代理注入密钥，变量可以不设（`vh` 会发占位值，代理替换）。
- **OpenAI**（可选，只用于给没有字幕的参考视频做语音转写）：`OPENAI_API_KEY`，或 `--asr local` 用 faster-whisper。
- 不要把任何 key 写进仓库或项目文件。

## 可选：rea-video

拆参考视频的"制作方式 / 包装层 / 声音"用 [rea-video](https://github.com/JuneYaooo/rea-video)：按它的 `scripts/install_skill.sh` 安装后，`python -m vh_analyze run <video> --rea` 会自动调用并合并。

## MCP（没有 shell 的客户端）

```json
{ "command": "node", "args": ["<repo>/packages/mcp/bin/mcp.mjs"] }
```

工具与 `vh` 命令一一对应（`vh_status`、`vh_check`、`vh_stills` 返回图片、`vh_render` 走 job）。有 shell 的 agent 直接用 `vh`，不需要 MCP。
