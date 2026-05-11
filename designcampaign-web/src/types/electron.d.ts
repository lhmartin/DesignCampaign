export interface FileInfo {
  name: string
  path: string
  size: number
  mtime: number
}

export interface FileFilter {
  name: string
  extensions: string[]
}

export interface ElectronAPI {
  // Dialogs
  openFolder(): Promise<string | null>
  saveFileDialog(defaultName: string, filters: FileFilter[]): Promise<string | null>

  // File system
  readFile(path: string): Promise<string>
  readFileBinary(path: string): Promise<ArrayBuffer>
  writeFile(path: string, data: string): Promise<void>
  listFiles(dir: string, extensions: string[]): Promise<FileInfo[]>
  getFileStats(path: string): Promise<{ size: number; mtime: number }>

  // Folder watching — returns cleanup function
  watchFolder(dir: string, callback: (event: string, filePath: string) => void): () => void

  // Menu events — return cleanup functions
  onMenuOpenFolder(callback: () => void): () => void
  onMenuRefresh(callback: () => void): () => void

  // Auto-update — return cleanup functions
  onUpdateAvailable(callback: () => void): () => void
  onUpdateDownloaded(callback: () => void): () => void
  installUpdate(): void

  // Claude API
  claudeSetKey(apiKey: string): Promise<{ ok: boolean }>
  claudeKeyStatus(): Promise<{ configured: boolean }>
  claudeChat(messages: unknown, system: string, tools: unknown): Promise<unknown>

  // Python sidecar
  pythonCall(action: string, args: unknown): Promise<unknown>
  pythonSetupStatus(): Promise<{ ready: boolean }>
  runPythonSetup(): Promise<{ ok: boolean; error?: string }>
  onPythonSetupProgress(callback: (message: string) => void): () => void
  onPythonSetupComplete(callback: () => void): () => void

  // Window chrome
  platform: string
  setTitleBarOverlay(opts: { color: string; symbolColor: string }): void

  // Marimo notebook server
  marimoStart(notebookPath: string): Promise<{ port: number; contextPath: string }>
  marimoStop(): Promise<void>
  marimoStatus(): Promise<{ running: boolean; port: number | null }>
  marimoInstall(): Promise<{ ok: boolean; error?: string }>
  marimoUpdateContext(ctx: unknown): Promise<{ contextPath: string; metricsPath: string }>
  onMarimoInstallProgress(callback: (msg: { done: boolean; message?: string }) => void): () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        style?: React.CSSProperties
      }
    }
  }
}
