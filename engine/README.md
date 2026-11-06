# engine · 渲染引擎（Remotion）

只有一份引擎；项目（`projects/<name>/`）作为数据挂入。积木不在这里，在 [`library/`](../library/README.md)。

## 安装

```bash
cd engine && npm install      # postinstall 会把 library/node_modules 链接到 engine/node_modules
npm run index                 # 扫描 library/，生成 library/index.json 与 src/generated/
```

浏览器：默认使用 `/opt/pw-browsers/.../chrome-headless-shell`，其他环境用 `VH_BROWSER` 指定 Chrome / Chromium 路径。

## 脚本

```bash
npx tsx scripts/validate.ts --project ../projects/<name>                          # 分镜校验（H11/H13/参数/意图/M1）
npx tsx scripts/render.ts   --project ../projects/<name> --out out.mp4             # 整片
npx tsx scripts/render.ts   --project ../projects/<name> --stills 1.2,3.4 --out d/  # 单帧 + 横向拼图
npm run studio                                                                     # Remotion Studio（占位分镜）
```

结果 JSON 打到 stdout、日志走 stderr，供 MCP server 以子进程调用。

## 结构

| 路径 | 内容 |
|---|---|
| `src/runtime/types.ts` | 分镜 / 语音格式（zod），见 docs/00 §5 |
| `src/runtime/Main.tsx` | 按素材 id 组装版式、镜头（`<Sequence>`）、转场、字幕、音频；按积木 schema 补默认参数 |
| `src/runtime/captions.ts` | 字幕切行（每行 ≤ 12 字，按句均衡） |
| `src/runtime/fonts.ts` | 字体随引擎打包，按本片实际文字触发加载并 `delayRender` |
| `src/generated/` | 由 `npm run index` 生成的注册表（组件 / 转场 / 预设 / 参数 schema） |
| `scripts/build-index.ts` | 素材库校验与索引 |

## 项目目录

```
projects/<name>/
  storyboard.json    分镜（agent 写）
  voice.json         逐词时间轴（第三阶段由 TTS / 对齐生成；示例中为合成时间轴）
  asset-lock.json    锁定的素材版本（asset_use 写入）
  public/assets/     由 asset_use 复制进来的媒体
  renders/           输出
```
