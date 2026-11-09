# video-harness：给 Agent 的说明

- 第一次使用：`bash scripts/install_skill.sh`，再 `vh --help` 确认。需要 Node ≥ 22、pnpm、ffmpeg、Python ≥ 3.10。
- 用户要做视频 / 拆参考视频时，**先读 `skills/video-harness/SKILL.md`**，按里面的流程做；每一步先跑 `vh status`。
- 仓库分工：
  - `skills/video-harness/`：给 agent 用的 skill（流程 + references），只写怎么用，不放开发文档
  - `packages/core`（纯函数：场景图、设计包、积木、schema、校验）· `packages/runtime`（Remotion 渲染）· `packages/cli`（`vh`）· `packages/mcp`（薄适配器）
  - `analyze/`：Python 分析层（rea-video 之上）
  - `docs/`：给人看的文档；`docs/dev/` 是开发文档
  - `eval/`、各包 `test/`、`analyze/tests/`：评测集和测试
- 开发约定：
  - 改动后跑 `pnpm typecheck && pnpm test` 和 `analyze/.venv/bin/python -m pytest -q analyze/tests`
  - 改了积木、渲染器或分析算法：跑合成评测（`docs/dev/evaluation.md`），结果更新到 `eval/RESULTS.md`
  - 积木示例必须通过版面校验（core 测试会检查）；改设计包后对比度测试必须通过
  - 业务逻辑只写在 `packages/core` / `packages/cli`，MCP 层只做转发
- 原则：只用代码生成画面（不调用图片 / 视频生成 API）；画面只由时间 t 决定；颜色只用 token。
- 不要提交任何密钥；ElevenLabs / OpenAI key 只从环境变量读取。
