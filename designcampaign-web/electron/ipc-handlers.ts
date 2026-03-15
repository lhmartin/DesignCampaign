import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

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

const watcherMap = new Map<string, fs.FSWatcher>()

export function cleanupWatchers(): void {
  for (const watcher of watcherMap.values()) {
    watcher.close()
  }
  watcherMap.clear()
}
