import { ipcMain, dialog, app, BrowserWindow, Menu } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
function registerIpcHandlers(getMainWindow) {
  ipcMain.handle("dialog:openFolder", async () => {
    const win2 = getMainWindow();
    if (!win2) return null;
    const result = await dialog.showOpenDialog(win2, {
      properties: ["openFile", "openDirectory"],
      title: "Open Protein Folder",
      filters: [
        { name: "Structure Files", extensions: ["pdb", "cif", "mmcif"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const selected = result.filePaths[0];
    return fs.statSync(selected).isDirectory() ? selected : path.dirname(selected);
  });
  ipcMain.handle("dialog:saveFile", async (_event, defaultName, filters) => {
    const win2 = getMainWindow();
    if (!win2) return null;
    const result = await dialog.showSaveDialog(win2, {
      defaultPath: defaultName,
      filters
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });
  ipcMain.handle("fs:readFile", async (_event, filePath) => {
    const resolved = path.resolve(filePath);
    return fs.readFileSync(resolved, "utf-8");
  });
  ipcMain.handle("fs:readFileBinary", async (_event, filePath) => {
    const resolved = path.resolve(filePath);
    const buffer = fs.readFileSync(resolved);
    return buffer;
  });
  ipcMain.handle("fs:writeFile", async (_event, filePath, data) => {
    const resolved = path.resolve(filePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, data, "utf-8");
  });
  ipcMain.handle("fs:listFiles", async (_event, dir, extensions) => {
    const resolved = path.resolve(dir);
    if (!fs.existsSync(resolved)) return [];
    const files = [];
    const exts = extensions.map((e) => e.toLowerCase());
    function scan(dirPath) {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          scan(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (exts.includes(ext)) {
            const stat = fs.statSync(fullPath);
            files.push({
              name: entry.name,
              path: fullPath,
              size: stat.size,
              mtime: stat.mtimeMs
            });
          }
        }
      }
    }
    scan(resolved);
    return files.sort((a, b) => a.name.localeCompare(b.name));
  });
  ipcMain.handle("fs:getFileStats", async (_event, filePath) => {
    const resolved = path.resolve(filePath);
    const stat = fs.statSync(resolved);
    return { size: stat.size, mtime: stat.mtimeMs };
  });
  ipcMain.handle("fs:watchFolder", async (_event, dir) => {
    const resolved = path.resolve(dir);
    const win2 = getMainWindow();
    if (!win2 || !fs.existsSync(resolved)) return;
    const watcher = fs.watch(resolved, { recursive: true }, (event, filename) => {
      if (filename) {
        win2.webContents.send("folder-changed", { event, path: path.join(resolved, filename) });
      }
    });
    watcherMap.set(resolved, watcher);
  });
  ipcMain.handle("fs:unwatchFolder", async (_event, dir) => {
    const resolved = path.resolve(dir);
    const watcher = watcherMap.get(resolved);
    if (watcher) {
      watcher.close();
      watcherMap.delete(resolved);
    }
  });
}
const watcherMap = /* @__PURE__ */ new Map();
function cleanupWatchers() {
  for (const watcher of watcherMap.values()) {
    watcher.close();
  }
  watcherMap.clear();
}
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "DesignCampaign",
    webPreferences: {
      preload: path.join(__dirname$1, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  const menu = Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [
        {
          label: "Open Folder",
          accelerator: "CmdOrCtrl+O",
          click: () => win == null ? void 0 : win.webContents.send("menu:openFolder")
        },
        {
          label: "Refresh",
          accelerator: "CmdOrCtrl+R",
          click: () => win == null ? void 0 : win.webContents.send("menu:refresh")
        },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "toggleDevTools" },
        { role: "reload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
  win.on("closed", () => {
    win = null;
  });
}
registerIpcHandlers(() => win);
app.on("window-all-closed", () => {
  cleanupWatchers();
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(createWindow);
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
