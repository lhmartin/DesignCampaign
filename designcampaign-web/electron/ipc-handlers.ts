import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'

export interface FileInfo {
  name: string
  path: string
  size: number
  mtime: number
}

export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null): void {

  // Open native folder dialog
  ipcMain.handle('dialog:openFolder', async () => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'openDirectory'],
      title: 'Open Protein Folder',
      filters: [
        { name: 'Structure Files', extensions: ['pdb', 'cif', 'mmcif'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const selected = result.filePaths[0]
    // If the user clicked a file instead of a folder, use its parent directory
    return fs.statSync(selected).isDirectory() ? selected : path.dirname(selected)
  })

  // Save file dialog
  ipcMain.handle('dialog:saveFile', async (_event, defaultName: string, filters: Electron.FileFilter[]) => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showSaveDialog(win, {
      defaultPath: defaultName,
      filters,
    })
    if (result.canceled || !result.filePath) return null
    return result.filePath
  })

  // Read file as UTF-8 string
  ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    const resolved = path.resolve(filePath)
    return fs.readFileSync(resolved, 'utf-8')
  })

  // Read file as binary (returns Buffer serialized as Uint8Array)
  ipcMain.handle('fs:readFileBinary', async (_event, filePath: string) => {
    const resolved = path.resolve(filePath)
    const buffer = fs.readFileSync(resolved)
    return buffer
  })

  // Write file
  ipcMain.handle('fs:writeFile', async (_event, filePath: string, data: string) => {
    const resolved = path.resolve(filePath)
    fs.mkdirSync(path.dirname(resolved), { recursive: true })
    fs.writeFileSync(resolved, data, 'utf-8')
  })

  // List files in directory with extension filter
  ipcMain.handle('fs:listFiles', async (_event, dir: string, extensions: string[]): Promise<FileInfo[]> => {
    const resolved = path.resolve(dir)
    if (!fs.existsSync(resolved)) return []

    const files: FileInfo[] = []
    const exts = extensions.map(e => e.toLowerCase())

    function scan(dirPath: string): void {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)
        if (entry.isDirectory()) {
          scan(fullPath)
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase()
          if (exts.includes(ext)) {
            const stat = fs.statSync(fullPath)
            files.push({
              name: entry.name,
              path: fullPath,
              size: stat.size,
              mtime: stat.mtimeMs,
            })
          }
        }
      }
    }

    scan(resolved)
    return files.sort((a, b) => a.name.localeCompare(b.name))
  })

  // Get file stats
  ipcMain.handle('fs:getFileStats', async (_event, filePath: string) => {
    const resolved = path.resolve(filePath)
    const stat = fs.statSync(resolved)
    return { size: stat.size, mtime: stat.mtimeMs }
  })

  // Watch folder for changes (sends events to renderer)
  ipcMain.handle('fs:watchFolder', async (_event, dir: string) => {
    const resolved = path.resolve(dir)
    const win = getMainWindow()
    if (!win || !fs.existsSync(resolved)) return

    const watcher = fs.watch(resolved, { recursive: true }, (event, filename) => {
      if (filename) {
        win.webContents.send('folder-changed', { event, path: path.join(resolved, filename) })
      }
    })

    // Store watcher so it can be cleaned up
    watcherMap.set(resolved, watcher)
  })

  ipcMain.handle('fs:unwatchFolder', async (_event, dir: string) => {
    const resolved = path.resolve(dir)
    const watcher = watcherMap.get(resolved)
    if (watcher) {
      watcher.close()
      watcherMap.delete(resolved)
    }
  })
}

// ── Python sidecar ────────────────────────────────────────────────────────────

let sidecarProcess: ChildProcess | null = null
const sidecarPending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

function getSidecar(): ChildProcess {
  if (sidecarProcess && sidecarProcess.exitCode === null) return sidecarProcess

  const pyCmd      = process.platform === 'win32' ? 'python' : 'python3'
  const scriptPath = path.join(app.getAppPath(), 'python', 'sidecar.py')

  sidecarProcess = spawn(pyCmd, [scriptPath], { stdio: ['pipe', 'pipe', 'inherit'] })

  const rl = createInterface({ input: sidecarProcess.stdout! })
  rl.on('line', (line: string) => {
    try {
      const msg = JSON.parse(line) as { id: string; result: unknown; error: string | null }
      const p   = sidecarPending.get(msg.id)
      if (!p) return
      sidecarPending.delete(msg.id)
      if (msg.error) p.reject(new Error(msg.error))
      else p.resolve(msg.result)
    } catch { /* ignore malformed lines */ }
  })

  sidecarProcess.on('exit', () => {
    sidecarProcess = null
    // Reject all pending calls if the sidecar dies unexpectedly
    for (const [id, p] of sidecarPending) {
      p.reject(new Error('Python sidecar exited unexpectedly'))
      sidecarPending.delete(id)
    }
  })

  return sidecarProcess
}

ipcMain.handle('python:call', async (_evt, action: string, args: unknown) => {
  const id   = crypto.randomUUID()
  const proc = getSidecar()
  proc.stdin!.write(JSON.stringify({ id, action, args }) + '\n')
  return new Promise((resolve, reject) => {
    sidecarPending.set(id, { resolve, reject })
    setTimeout(() => {
      if (sidecarPending.has(id)) {
        sidecarPending.delete(id)
        reject(new Error('Python sidecar timeout (30 s)'))
      }
    }, 30_000)
  })
})

export function cleanupSidecar(): void {
  if (sidecarProcess) {
    sidecarProcess.kill()
    sidecarProcess = null
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const watcherMap = new Map<string, fs.FSWatcher>()

export function cleanupWatchers(): void {
  for (const watcher of watcherMap.values()) {
    watcher.close()
  }
  watcherMap.clear()
}
