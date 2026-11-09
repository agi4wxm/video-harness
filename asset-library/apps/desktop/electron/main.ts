// Electron 主进程：在本机启动素材库 API（127.0.0.1 随机端口），窗口加载界面。
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Server } from "node:http";
import { Library, startServer } from "@asset-library/core";

const CONFIG = () => join(app.getPath("userData"), "config.json");
type Config = { libraryRoot?: string; recent?: string[] };
const readConfig = (): Config => { try { return JSON.parse(readFileSync(CONFIG(), "utf8")); } catch { return {}; } };
const writeConfig = (c: Config) => writeFileSync(CONFIG(), JSON.stringify(c, null, 2));

let win: BrowserWindow | null = null;
let server: Server | null = null;
let apiBase = "";
let libraryRoot = "";

async function openLibrary(root: string) {
  Library.open(root); // 校验是素材库
  if (server) await new Promise((ok) => server!.close(() => ok(null)));
  const s = await startServer({ root, port: 0, reviewer: process.env.USER });
  server = s.server;
  apiBase = s.url;
  libraryRoot = root;
  const c = readConfig();
  writeConfig({ libraryRoot: root, recent: [root, ...(c.recent ?? []).filter((x) => x !== root)].slice(0, 8) });
}

async function chooseLibrary(create = false): Promise<string | null> {
  const r = await dialog.showOpenDialog(win!, {
    title: create ? "选择新素材库的位置" : "打开素材库（包含 library.yaml 的文件夹）",
    properties: ["openDirectory", "createDirectory"],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const dir = r.filePaths[0];
  if (!existsSync(join(dir, "library.yaml"))) {
    const { response } = await dialog.showMessageBox(win!, { type: "question", buttons: ["在这里新建素材库", "取消"], defaultId: 0, message: "这个文件夹还不是素材库", detail: dir });
    if (response !== 0) return null;
    Library.init(dir, "素材库");
  }
  await openLibrary(dir);
  return dir;
}

function loadUI() {
  const q = `?api=${encodeURIComponent(apiBase)}`;
  if (process.env.VITE_DEV_URL) win!.loadURL(process.env.VITE_DEV_URL + q);
  else win!.loadFile(join(__dirname, "..", "renderer", "index.html"), { search: q });
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1480, height: 920, minWidth: 1080, minHeight: 680,
    titleBarStyle: "hiddenInset", trafficLightPosition: { x: 18, y: 18 },
    vibrancy: "sidebar", visualEffectState: "active",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#00000000" : "#00000000",
    show: false,
    webPreferences: { preload: join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true },
  });
  win.once("ready-to-show", () => win!.show());
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  const c = readConfig();
  const initial = process.env.ASSET_LIBRARY ?? c.libraryRoot;
  if (initial && existsSync(join(initial, "library.yaml"))) await openLibrary(initial);
  else if (!(await chooseLibrary())) { app.quit(); return; }
  loadUI();
}

ipcMain.handle("library:choose", async () => { const d = await chooseLibrary(); if (d) loadUI(); return d; });
ipcMain.handle("library:info", () => ({ apiBase, root: libraryRoot, recent: readConfig().recent ?? [] }));
ipcMain.handle("library:reveal", (_e, rel: string) => { shell.showItemInFolder(join(libraryRoot, rel)); });
ipcMain.handle("library:open-recent", async (_e, root: string) => { await openLibrary(root); loadUI(); });

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: "appMenu" },
    { label: "文件", submenu: [
      { label: "打开素材库…", accelerator: "CmdOrCtrl+O", click: async () => { if (await chooseLibrary()) loadUI(); } },
      { label: "在访达中显示素材库", click: () => libraryRoot && shell.openPath(libraryRoot) },
      { type: "separator" }, { role: "close" },
    ] },
    { role: "editMenu" },
    { label: "显示", submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "togglefullscreen" }] },
    { role: "windowMenu" },
  ]));
}

app.whenReady().then(() => { buildMenu(); createWindow(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
