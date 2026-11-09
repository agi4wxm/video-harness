// 预加载：只向界面暴露少量安全的能力
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  chooseLibrary: () => ipcRenderer.invoke("library:choose"),
  info: () => ipcRenderer.invoke("library:info"),
  reveal: (rel: string) => ipcRenderer.invoke("library:reveal", rel),
  openRecent: (root: string) => ipcRenderer.invoke("library:open-recent", root),
});
