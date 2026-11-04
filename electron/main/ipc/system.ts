import { app, clipboard, ClipboardItem, dialog, ipcMain, shell } from "electron";
import { stat, writeFile } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { pathToFileURL } from "node:url";
import type { Track } from "@shared/types/player";
import { getFonts } from "font-list";
import type { LocaleCode } from "@shared/types/settings";
import { setLocale } from "@main/utils/i18n";
import { systemLog } from "@main/utils/logger";

import { refreshTray } from "@main/services/tray";
import { getMainWindow, focusMainWindow } from "@main/window";
import { fetchBytes } from "@main/utils/fetchBytes";
import { logsDir } from "@main/utils/paths";
import { consumePendingOrpheusUrl } from "@main/services/orpheus";
import { consumePendingAudioFiles } from "@main/services/externalFile";
import { store } from "@main/store";

/**
 * Register system IPC endpoints.
 */
export const registerSystemIpc = (): void => {
  ipcMain.on("ping", () => systemLog.debug("pong"));

  // 渲染层拉取冷启动暂存的 orpheus 唤起 URL
  ipcMain.handle("system:consumePendingProtocolUrl", () => consumePendingOrpheusUrl());

  // 渲染层拉取冷启动暂存的外部音频文件列表
  ipcMain.handle("system:consumePendingAudioFiles", () => consumePendingAudioFiles());

  // 切换开发者工具
  ipcMain.handle("system:toggleDevTools", () => {
    const win = getMainWindow();
    if (win) {
      const wc = win.webContents;
      wc.isDevToolsOpened() ? wc.closeDevTools() : wc.openDevTools({ mode: "detach" });
    }
  });

  // 在文件管理器中显示文件
  ipcMain.handle("system:showInExplorer", (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle("system:copyTrackFile", async (_event, track: Track): Promise<boolean> => {
    try {
      const filePath = track.source === "local" ? (track.cueAudioPath ?? track.path) : undefined;
      if (!filePath) return false;
      if (track.source === "local") {
        const file = await stat(filePath);
        if (!file.isFile() || file.size === 0) return false;
      }

      const url = pathToFileURL(filePath).href;
      await clipboard.write([new ClipboardItem({ "text/uri-list": `${url}\r\n` })]);

      return true;
    } catch (error) {
      systemLog.error("复制歌曲文件失败", error);
      return false;
    }
  });

  // 打开日志目录
  ipcMain.handle("system:openLogsDir", () => shell.openPath(logsDir));

  // 切换主进程语言
  ipcMain.on("system:setLocale", (_event, locale: LocaleCode) => {
    if (setLocale(locale)) {
      refreshTray();
    }
  });

  // 显示并聚焦主窗口
  ipcMain.handle("system:focusMainWindow", () => focusMainWindow());

  // 在主窗口打开设置弹窗
  ipcMain.handle("system:openSettings", (_event, category?: string, highlight?: string) => {
    focusMainWindow();
    getMainWindow()?.webContents.send("system:openSettings", { category, highlight });
  });

  // 获取系统已安装字体
  let fontsCache: Promise<string[]> | null = null;
  ipcMain.handle("system:listFonts", (): Promise<string[]> => {
    if (!fontsCache) {
      fontsCache = getFonts({ disableQuoting: true }).catch((err) => {
        systemLog.error("[system] listFonts failed", err);
        fontsCache = null;
        return [];
      });
    }
    return fontsCache;
  });

  // 重启应用
  ipcMain.handle("system:relaunch", () => {
    store.flushImmediate();
    app.relaunch();
    app.exit(0);
  });

  // 把封面图 URL 拉成字节回渲染层
  // 用于 canvas 取色等需要绕过跨域 tainted 的场景；限定 image/* 响应
  ipcMain.handle("system:fetchRemoteBytes", async (_event, url: string) => {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      return { success: false, error: "无效的 URL" };
    }
    const buf = await fetchBytes(url, { requireImage: true });
    return { success: true, data: buf };
  });

  // Let the user choose the destination and confirm any overwrite in the native dialog.
  ipcMain.handle(
    "system:saveFile",
    async (_event, data: ArrayBuffer, fileName: string, title?: string) => {
      try {
        const safeName = basename(fileName)
          .replace(/[\\/:*?"<>|]/g, " ")
          .trim();
        if (!safeName || safeName === "." || safeName === "..") {
          return { success: false, error: "invalid file name" };
        }
        const extension = extname(safeName).slice(1);
        const options = {
          title,
          defaultPath: join(app.getPath("downloads"), safeName),
          properties: ["showOverwriteConfirmation" as const],
          ...(extension
            ? { filters: [{ name: extension.toUpperCase(), extensions: [extension] }] }
            : {}),
        };
        const win = getMainWindow();
        const result = win
          ? await dialog.showSaveDialog(win, options)
          : await dialog.showSaveDialog(options);
        if (result.canceled || !result.filePath) return { success: false, canceled: true };
        await writeFile(result.filePath, Buffer.from(data));
        return { success: true, path: result.filePath };
      } catch (error) {
        systemLog.error("[system] saveFile failed", error);
        return { success: false, error: String(error) };
      }
    },
  );
};
