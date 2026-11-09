// 开发模式：启动 vite，再用 electron 打开（渲染进程热更新）
import { spawn } from "node:child_process";
import { createServer } from "vite";
const vite = await createServer({ configFile: "vite.config.ts" });
await vite.listen();
const url = vite.resolvedUrls.local[0];
await import("./build-electron.mjs");
const electron = (await import("electron")).default;
const p = spawn(electron, ["."], { stdio: "inherit", env: { ...process.env, VITE_DEV_URL: url } });
p.on("close", () => { vite.close(); process.exit(0); });
