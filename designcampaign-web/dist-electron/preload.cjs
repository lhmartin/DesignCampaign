"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  // Dialogs
  openFolder: () => electron.ipcRenderer.invoke("dialog:openFolder"),
  saveFileDialog: (defaultName, filters) => electron.ipcRenderer.invoke("dialog:saveFile", defaultName, filters),
  // File system
  readFile: (filePath) => electron.ipcRenderer.invoke("fs:readFile", filePath),
  readFileBinary: (filePath) => electron.ipcRenderer.invoke("fs:readFileBinary", filePath),
  writeFile: (filePath, data) => electron.ipcRenderer.invoke("fs:writeFile", filePath, data),
  listFiles: (dir, extensions) => electron.ipcRenderer.invoke("fs:listFiles", dir, extensions),
  getFileStats: (filePath) => electron.ipcRenderer.invoke("fs:getFileStats", filePath),
  // Folder watching — returns cleanup function
  watchFolder: (dir, callback) => {
    electron.ipcRenderer.invoke("fs:watchFolder", dir);
    const listener = (_event, data) => {
      callback(data.event, data.path);
    };
    electron.ipcRenderer.on("folder-changed", listener);
    return () => {
      electron.ipcRenderer.invoke("fs:unwatchFolder", dir);
      electron.ipcRenderer.off("folder-changed", listener);
    };
  },
  // Menu events
  onMenuOpenFolder: (callback) => {
    electron.ipcRenderer.on("menu:openFolder", callback);
    return () => electron.ipcRenderer.off("menu:openFolder", callback);
  },
  onMenuRefresh: (callback) => {
    electron.ipcRenderer.on("menu:refresh", callback);
    return () => electron.ipcRenderer.off("menu:refresh", callback);
  },
  // Auto-update events — return cleanup functions
  onUpdateAvailable: (cb) => {
    electron.ipcRenderer.on("update:available", cb);
    return () => electron.ipcRenderer.off("update:available", cb);
  },
  onUpdateDownloaded: (cb) => {
    electron.ipcRenderer.on("update:downloaded", cb);
    return () => electron.ipcRenderer.off("update:downloaded", cb);
  },
  installUpdate: () => {
    electron.ipcRenderer.send("update:install");
  },
  // Python sidecar
  pythonCall: (action, args) => electron.ipcRenderer.invoke("python:call", action, args),
  pythonSetupStatus: () => electron.ipcRenderer.invoke("python:setup-status"),
  runPythonSetup: () => electron.ipcRenderer.invoke("python:run-setup"),
  onPythonSetupProgress: (cb) => {
    const listener = (_, message) => cb(message);
    electron.ipcRenderer.on("python:setup-progress", listener);
    return () => electron.ipcRenderer.off("python:setup-progress", listener);
  },
  onPythonSetupComplete: (cb) => {
    electron.ipcRenderer.on("python:setup-complete", cb);
    return () => electron.ipcRenderer.off("python:setup-complete", cb);
  }
});
