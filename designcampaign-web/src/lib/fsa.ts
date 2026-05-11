import { isCloudPath } from '@/lib/cloud-paths'

/** Read a file via Electron IPC or the stored FileSystemDirectoryHandle (FSA browser mode). */
export async function readFileContent(filePath: string): Promise<string> {
  if (window.electronAPI && isCloudPath(filePath)) {
    return window.electronAPI.cloudReadFile(filePath)
  }
  if (window.electronAPI) {
    return window.electronAPI.readFile(filePath)
  }
  const dirHandle = (window as Window & { __dirHandle?: FileSystemDirectoryHandle }).__dirHandle
  if (!dirHandle) throw new Error('No directory handle — open a folder first')
  const parts = filePath.split('/')
  let cur: FileSystemDirectoryHandle = dirHandle
  for (let i = 0; i < parts.length - 1; i++) cur = await cur.getDirectoryHandle(parts[i])
  const fh = await cur.getFileHandle(parts[parts.length - 1])
  return (await fh.getFile()).text()
}
