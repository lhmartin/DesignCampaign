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

  // Python sidecar
  pythonCall(action: string, args: unknown): Promise<unknown>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
