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

  // Auto-update events — return cleanup functions
  onUpdateAvailable: (cb: () => void): (() => void) => {
    ipcRenderer.on('update:available', cb)
    return () => ipcRenderer.off('update:available', cb)
  },

  onUpdateDownloaded: (cb: () => void): (() => void) => {
    ipcRenderer.on('update:downloaded', cb)
    return () => ipcRenderer.off('update:downloaded', cb)
  },

  installUpdate: (): void => {
    ipcRenderer.send('update:install')
  },

  // Claude API
  claudeSetKey: (apiKey: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('claude:set-key', apiKey),

  claudeKeyStatus: (): Promise<{ configured: boolean }> =>
    ipcRenderer.invoke('claude:key-status'),

  claudeChat: (messages: unknown, system: string, tools: unknown): Promise<unknown> =>
    ipcRenderer.invoke('claude:chat', messages, system, tools),

  // Python sidecar
  pythonCall: (action: string, args: unknown): Promise<unknown> =>
    ipcRenderer.invoke('python:call', action, args),

  pythonSetupStatus: (): Promise<{ ready: boolean }> =>
    ipcRenderer.invoke('python:setup-status'),

  runPythonSetup: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('python:run-setup'),

  onPythonSetupProgress: (cb: (message: string) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, message: string) => cb(message)
    ipcRenderer.on('python:setup-progress', listener)
    return () => ipcRenderer.off('python:setup-progress', listener)
  },

  onPythonSetupComplete: (cb: () => void): (() => void) => {
    ipcRenderer.on('python:setup-complete', cb)
    return () => ipcRenderer.off('python:setup-complete', cb)
  },

  // Marimo notebook server
  marimoStart: (notebookPath: string): Promise<{ port: number; contextPath: string }> =>
    ipcRenderer.invoke('marimo:start', notebookPath),

  marimoStop: (): Promise<void> =>
    ipcRenderer.invoke('marimo:stop'),

  marimoStatus: (): Promise<{ running: boolean; port: number | null }> =>
    ipcRenderer.invoke('marimo:status'),

  marimoInstall: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('marimo:install'),

  marimoUpdateContext: (ctx: unknown): Promise<{ contextPath: string; metricsPath: string }> =>
    ipcRenderer.invoke('marimo:update-context', ctx),

  onMarimoInstallProgress: (cb: (msg: { done: boolean; message?: string }) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, msg: { done: boolean; message?: string }) => cb(msg)
    ipcRenderer.on('marimo:install-progress', listener)
    return () => ipcRenderer.off('marimo:install-progress', listener)
  },

  // Open URL in system browser
  openExternal: (url: string): void => { ipcRenderer.send('open-external', url) },

  // Cloud storage
  cloudListConnections: (): Promise<import('./cloud-handlers').CloudConnectionMeta[]> =>
    ipcRenderer.invoke('cloud:list-connections'),

  cloudAddConnection: (input: import('./cloud-handlers').AddConnectionInput): Promise<{ ok: boolean; id?: string; error?: string }> =>
    ipcRenderer.invoke('cloud:add-connection', input),

  cloudDeleteConnection: (id: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('cloud:delete-connection', { id }),

  cloudTestConnection: (input: import('./cloud-handlers').TestConnectionInput): Promise<{ ok: boolean; error?: string; fileCount?: number }> =>
    ipcRenderer.invoke('cloud:test-connection', input),

  cloudListFiles: (id: string): Promise<Array<{ name: string; path: string; size: number; mtime: number }>> =>
    ipcRenderer.invoke('cloud:list-files', { id }),

  cloudReadFile: (path: string): Promise<string> =>
    ipcRenderer.invoke('cloud:read-file', { path }),
})
