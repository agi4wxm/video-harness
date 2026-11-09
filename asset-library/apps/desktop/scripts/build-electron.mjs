// 打包 Electron 主进程与预加载脚本（把 @asset-library/core 及其依赖一起打进去）
import { build } from "esbuild";
const common = { bundle: true, platform: "node", target: "node22", format: "cjs", sourcemap: true, external: ["electron"], logLevel: "info" };
await build({ ...common, entryPoints: ["electron/main.ts"], outfile: "dist/electron/main.cjs" });
await build({ ...common, entryPoints: ["electron/preload.ts"], outfile: "dist/electron/preload.cjs" });
