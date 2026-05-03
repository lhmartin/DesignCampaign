export interface CloudConnectionMeta {
  id: string
  provider: 'azure' | 'gcs'
  label: string
  azureBaseUrl?: string
  azurePrefix?: string
  gcsBucket?: string
  gcsPrefix?: string
  gcsSaEmail?: string
  createdAt: number
}

export interface AddConnectionInput {
  provider: 'azure' | 'gcs'
  label: string
  sasUrl?: string
  azurePrefix?: string
  serviceAccountJson?: string
  gcsBucket?: string
  gcsPrefix?: string
}

export type TestConnectionInput = Omit<AddConnectionInput, 'label'>

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

  // Marimo notebook server
  marimoStart(notebookPath: string): Promise<{ port: number; contextPath: string }>
  marimoStop(): Promise<void>
  marimoStatus(): Promise<{ running: boolean; port: number | null }>
  marimoInstall(): Promise<{ ok: boolean; error?: string }>
  marimoUpdateContext(ctx: unknown): Promise<{ contextPath: string; metricsPath: string }>
  onMarimoInstallProgress(callback: (msg: { done: boolean; message?: string }) => void): () => void

  // Open URL in system browser
  openExternal(url: string): void

  // Cloud storage
  cloudListConnections(): Promise<CloudConnectionMeta[]>
  cloudAddConnection(input: AddConnectionInput): Promise<{ ok: boolean; id?: string; error?: string }>
  cloudDeleteConnection(id: string): Promise<{ ok: boolean }>
  cloudTestConnection(input: TestConnectionInput): Promise<{ ok: boolean; error?: string; fileCount?: number }>
  cloudListFiles(id: string): Promise<FileInfo[]>
  cloudReadFile(path: string): Promise<string>
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
