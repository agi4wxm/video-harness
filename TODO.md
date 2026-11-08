# video-harness · 交接说明与未完成事项

更新：2026-11-08。分支：`claude/ecstatic-einstein-x02pmd`（GitHub：agifirefly-wu/video-harness）。

## 0. 从备份恢复

备份文件 `video-harness-full.bundle` 是完整 git 仓库，包含全部提交和分支，约 97MB；其中约 89MB 是已删除的 5 条参考视频的历史版本。

```bash
git clone video-harness-full.bundle video-harness
cd video-harness
git checkout claude/ecstatic-einstein-x02pmd
# 之后可以推到新的远端：
git remote set-url origin <新仓库地址>
git push -u origin --all
```

**不在 git 里**（被 .gitignore 排除、可以重新生成）的内容：

- `analysis/*/videos/`：逐视频原始测量、转写、拼图；
- `cache/`：语音识别缓存，以及拼接好的 Kurzgesagt 整片；
- `projects/`、`node_modules/`。

环境依赖：

```bash
pip install -e measure[openai]
(cd engine && npm install && npm run index)
(cd server && npm install && npm run build)
```

还需要：ffmpeg、Chromium / chrome-headless-shell（路径用 `VH_BROWSER` 指定）、CJK 字体。

## 1. 项目当前定义

**通过 MCP 提供给任意 agent 的"代码做视频"流水线**：把参考视频拆成可执行的制作方案 → 创意简报 → 分镜 → 积木与专门手写的画面渲染 → 成片再拆一遍、和参考比对、修复。闭环是 **拆 → 做 → 再拆比对**。

三个外部参考各自的位置：

| 参考 | 角色 |
|---|---|
| [rea-video](https://github.com/JuneYaooo/rea-video)（Apache-2.0） | "拆"的底座：逐镜制作方式、证据、看图复核协议、包装层、声音分轨、评测纪律 |
| [awesome-opus5-5-videos](https://github.com/yihui-dev/awesome-opus5-5-videos)（MIT） | "做"的经验：创意简报格式、`seek(t)` 确定性渲染约定、按题材区分的禁用清单；703 条提示词也是评测题库 |
| Kurzgesagt / 差评君参考片 | "品味"：设计体系、连续性、视觉想法、剪辑节奏 |

详细见 `docs/00`–`docs/04`，以及 `analysis/chaping/REPORT.md`、`analysis/kurzgesagt/REPORT.md`。

## 2. 已完成

| 部分 | 内容 |
|---|---|
| 文档 | 00 架构、01 参考分析、02 质量规范 v0.1、03 素材库、04 rea-video 评估 |
| 测量 `measure/` | 版式检测、两段式切点、视觉节拍、响度（与 ffmpeg 交叉验证）、逐字时间戳（OpenAI whisper / faster-whisper / file:）、OCR 分类、入场跟踪、OKLab 调色板、拼图、多视频汇总（含随机基线） |
| MCP `server/` | 分析：`video_analyze`、`analysis_list`、`analysis_sheet`、`segments_label`、`profile_build`；素材：`asset_search`、`asset_get`、`asset_preview`、`asset_use`；项目与渲染：`project_init`、`storyboard_validate`、`render_stills`、`render_video`；长任务：`job_status`、`job_wait` |
| 引擎 `engine/` | Remotion runtime：按素材 id 组装版式、镜头、转场、字幕、音频；索引构建与校验；渲染单帧 / 整片 |
| 素材库 `library/` | 清单格式、积木 SDK；3 个积木、1 个版式、2 个预设、2 个转场、3 套字体、1 张图片 |
| 参考分析 | 差评君 4 条 + hoverslam 1 条（`analysis/chaping/`）；Kurzgesagt 1 条（`analysis/kurzgesagt/`） |
| 演示片 | `examples/battery-80`：19s、无声；**作为"廉价感"的反面样本**（原因分析见对话记录与 kurzgesagt 报告第 2 节） |

## 3. 未完成事项（按建议顺序）

### P0 · 方向确认
- [ ] 把第 1 节的新定义写进 `docs/00-architecture.md`（流程改为：拆 → 简报 → 分镜 → 构建两条路 → 渲染 → 再拆比对 → 沉淀）。
- [ ] 用户确认要先做下面哪一块。

### P1 · 分析底座：接入 rea-video 并做扩展（docs/04 第 3、4 节）
- [ ] 把 rea-video 作为依赖；MCP 增加 `rea_decompose`、`rea_review`、`rea_apply_review`、`rea_correct`。
- [ ] 扩展 1：**版式感知**。先检测模板区域，切镜、纹理、动效只在内容区计算（实测：演示片 rea-video 只找到 2/7 个切点）。
- [ ] 扩展 2：**镜头 → 视觉节拍**两级结构（必须和扩展 1 一起做）。
- [ ] 扩展 3：**2D 动画识别**（插画纹理、非刚体形变、分层视差、有限帧节奏；实测 Kurzgesagt 全部判错）。
- [ ] 扩展 4：**语音转写锚定**。字幕按"文字和同时刻语音一致"判定；画面切换与旁白停顿的关系（Kurzgesagt 44% vs 差评君约 1%）。
- [ ] 扩展 5：按制作方式开关分析维度；渲染画面改为设计体系、动效语言、虚拟相机、母题。
- [ ] 扩展 6：元素轨迹（位置 / 缩放 / 透明度曲线、缓动或弹簧参数）→ 映射成积木参数，生成分镜草稿。
- [ ] `measure/` 与 rea-video 重叠的部分（切点、OCR、音频）退役；保留版式、节拍、语音对齐、跨视频汇总。
- [ ] 通用修复（版式感知、字幕判定）整理成 PR 回馈上游。

### P2 · 评测集（改进能否证明有效的前提）
- [ ] 合成集 A：随机分镜 × 我们的积木 → 渲染，分镜即真值。
- [ ] 合成集 B：从 awesome-opus5-5-videos 选完整提示词（动效 / 讲解 / 3D 各若干）→ agent 写成 `seek(t)` 代码 → 逐帧渲染并插桩导出真值（GSAP 时间线、`document.getAnimations()`、DOM 元素框、Three.js 场景与相机）。**需要大量 token，先小规模试点，或接 API 批量生成。**
- [ ] 平台压缩变体：ffmpeg 重新压缩 / 降码率 / 转 30fps。
- [ ] 真实视频验收集：每类 3–5 条，人工看图标注，只验收不调参。

### P3 · 生成端
- [ ] **创意简报阶段**（`<inputs>/<direction>/<structure>/<build>/<gotchas>/<start>` 格式），在分镜之前，带人工确认。
- [ ] 分镜增加"视觉想法"字段：每个节拍画什么具体的东西、用什么隐喻、哪个母题反复出现。
- [ ] `seek(t)` 手写画面适配器：HTML / Three.js 场景挂进 Remotion 时间轴。
- [ ] 积木升级为场景级：插画场景 + 虚拟相机、带呼吸动作和表情的角色、人群 / 点阵数据图、章节标题卡、闪回滤镜、分屏。
- [ ] 风格包改为"插画世界"体系：按章节换调色板、固定语义色、明亮底色、高彩度（参考 Kurzgesagt 报告第 7 节）。
- [ ] 配音（TTS，可控制停顿）+ 混音 + 音效。**待用户决定 TTS 服务商。**
- [ ] 少量生成式镜头接入（gpt-image-2 已验证可用；视频生成 API 待定）。

### P4 · 质量闭环
- [ ] 成片再拆 → 与参考的制作方案逐镜、逐节拍、逐元素比对 → 评分卡。
- [ ] 改写 `docs/02`：保留硬约束；统计区间降级；加入比对评分与"反廉价"评审（禁用清单按题材分组，例如产品宣传禁辉光，而 Kurzgesagt 大量用辉光）。
- [ ] 纠正记忆（`corrections.jsonl`）与用户 A/B 偏好记录。

## 4. 待用户决定

1. TTS 服务商（免费 Edge TTS / MiniMax / 火山 / ElevenLabs）。
2. 默认画幅（竖屏 1080×1920 还是横屏）。
3. 视频生成 API（可灵 / 即梦 / Veo / fal）。
4. 第 3 节的优先顺序。
5. 是否补充参考视频：Kurzgesagt 再 2–3 条、Zack D. Films（竖屏 3D）、Johnny Harris（剪辑）。

## 5. 环境与已知问题

- 本会话的云环境访问不了 YouTube 和 HuggingFace；语音识别通过代理调用 OpenAI whisper-1。
- rea-video 依赖的 `rapidocr-onnxruntime` 在 Python 3.13 上没有新版本，需要用系统里的 1.2.3（用 `venv --system-site-packages` 安装）。
- 测量工具对自己的成片会把大字标题误归为"字幕"，应改用渲染时导出的元素信息。
- 切点检测漏掉叠化和遮罩转场；入场缓动曲线的拟合不可靠（未通过 E1）。
