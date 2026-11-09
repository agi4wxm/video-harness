# macOS 应用封装

桌面应用在 `apps/desktop/`：Electron 主进程在本机启动素材库 API（`127.0.0.1` 随机端口），窗口加载 React 界面。素材库就是磁盘上的一个文件夹，第一次启动时选择（或新建）。

## 环境

- macOS 13+，Xcode Command Line Tools（`xcode-select --install`）
- Node.js ≥ 20、pnpm 10（`corepack enable`）
- 可选：`brew install librsvg`（生成图标）

## 步骤

```bash
cd asset-library
pnpm install                      # 会下载 Electron
cd apps/desktop
bash scripts/make-icon.sh         # build/icon.svg → build/icon.icns
pnpm dev                          # 开发运行（热更新）
pnpm dist:mac                     # 打包：release/素材库-<版本>-arm64.dmg / -x64.dmg / .zip
```

打开应用 → 选择素材库文件夹（例如仓库里的 `asset-library/library`）。之后会记住；菜单「文件 → 打开素材库…」（⌘O）可以切换。也可以用环境变量 `ASSET_LIBRARY=<路径>` 启动。

## 签名与公证（分发给别人时需要）

1. 在钥匙串里装好 **Developer ID Application** 证书，或设置：
   ```bash
   export CSC_LINK=/path/to/cert.p12
   export CSC_KEY_PASSWORD=…
   ```
2. 公证：设置 `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`，并在 `electron-builder.yml` 里取消 `notarize: true` 的注释。
3. 只自己用：不签名也能打包，首次打开时右键 →「打开」。

## 文件说明

| 文件 | 作用 |
|---|---|
| `electron/main.ts` | 主进程：选择 / 记住素材库、启动本地 API、窗口（隐藏标题栏、侧栏毛玻璃）、菜单 |
| `electron/preload.ts` | 向界面暴露：选择素材库、在访达中显示、最近打开 |
| `renderer/` | React 界面（素材网格 / 列表、检视面板、分类体系与归类向导、拆解记录、审查、⌘K 命令面板、明暗外观） |
| `electron-builder.yml` | 打包配置：dmg + zip，arm64 + x64，hardened runtime |
| `build/entitlements.mac.plist` | hardened runtime 权限 |
| `build/icon.svg` · `scripts/make-icon.sh` | 应用图标 |
| `scripts/build-electron.mjs` | esbuild 打包主进程（把素材库内核一起打进去） |

## 不打包，直接在浏览器里用

```bash
cd asset-library
pnpm build                          # 构建界面
pnpm lib serve --root library       # 打开 http://127.0.0.1:4580/
```
