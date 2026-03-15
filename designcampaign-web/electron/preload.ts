import { ipcRenderer, contextBridge } from 'electron'

// Expose the Electron API to the renderer process via contextBridge
contextBridge.exposeInMainWorld('electronAPI', {

  // Dialogs
  openFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openFolder'),

  saveFileDialog: (defaultName: string, filters: Array<{ name: string; extensions: string[] }>): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveFile', defaultName, filters),

  // File system
  readFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:readFile', filePath),

  readFileBinary: (filePath: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke('fs:readFileBinary', filePath),

  writeFile: (filePath: string, data: string): Promise<void> =>
    ipcRenderer.invoke('fs:writeFile', filePath, data),

  listFiles: (dir: string, extensions: string[]): Promise<Array<{ name: string; path: string; size: number; mtime: number }>> =>
    ipcRenderer.invoke('fs:listFiles', dir, extensions),

  getFileStats: (filePath: string): Promise<{ size: number; mtime: number }> =>
    ipcRenderer.invoke('fs:getFileStats', filePath),

  // Folder watching — returns cleanup function
  watchFolder: (dir: string, callback: (event: string, filePath: string) => void): (() => void) => {
    ipcRenderer.invoke('fs:watchFolder', dir)
    const listener = (_event: Electron.IpcRendererEvent, data: { event: string; path: string }) => {
      callback(data.event, data.path)
    }
    ipcRenderer.on('folder-changed', listener)
    return () => {
      ipcRenderer.invoke('fs:unwatchFolder', dir)
      ipcRenderer.off('folder-changed', listener)
    }
  },

  // Menu events
  onMenuOpenFolder: (callback: () => void): (() => void) => {
    ipcRenderer.on('menu:openFolder', callback)
    return () => ipcRenderer.off('menu:openFolder', callback)
  },

  onMenuRefresh: (callback: () => void): (() => void) => {
    ipcRenderer.on('menu:refresh', callback)
    return () => ipcRenderer.off('menu:refresh', callback)
  },
})
