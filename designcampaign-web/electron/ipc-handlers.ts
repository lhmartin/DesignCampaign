import { ipcMain, dialog, BrowserWindow, safeStorage, app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import Anthropic from '@anthropic-ai/sdk'
import { isEnvReady, getPythonExe, getSidecarScriptPath, runSetup, installPackages } from './python-setup'

export interface FileInfo {
  name: string
  path: string
  size: number
  mtime: number
}

interface MarimoMetricRow {
  name: string
  filePath: string | null
  metrics: Record<string, number>
}

interface MarimoUpdateContext {
  active_file: string | null
  current_folder: string | null
  filtered_files: string[]
  filters: unknown
  ranking_mode: string
  ranking_metrics: unknown
  metricsRows: MarimoMetricRow[]
}

// Registered before other handlers so the marimo:install channel exists when the app starts.
export function registerMarimoInstall(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('marimo:install', async () => {
    const win = getMainWindow()
    try {
      await installPackages(['marimo'], msg => {
        win?.webContents.send('marimo:install-progress', { done: false, message: msg })
      })
      win?.webContents.send('marimo:install-progress', { done: true })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  registerMarimoInstall(getMainWindow)

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

    const t0 = Date.now()
    const files: FileInfo[] = []
    const extSet = new Set(extensions.map(e => e.toLowerCase()))

    function scan(dirPath: string): void {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          scan(path.join(dirPath, entry.name))
        } else if (entry.isFile() && extSet.has(path.extname(entry.name).toLowerCase())) {
          const fullPath = path.join(dirPath, entry.name)
          const stat = fs.statSync(fullPath)
          files.push({ name: entry.name, path: fullPath, size: stat.size, mtime: stat.mtimeMs })
        }
      }
    }

    scan(resolved)
    files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    console.log(`[listFiles] ${files.length} files in ${Date.now() - t0}ms`)
    return files
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

    watcherMap.get(resolved)?.close()

    const watcher = fs.watch(resolved, { recursive: true }, (event, filename) => {
      if (filename) {
        win.webContents.send('folder-changed', { event, path: path.join(resolved, filename) })
      }
    })
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

  // ── Claude API ────────────────────────────────────────────────────────────

  const claudeKeyPath = path.join(app.getPath('userData'), 'claude-key.enc')
  let claudeClient: Anthropic | null = null  // cached; reset when key changes

  ipcMain.handle('claude:set-key', async (_e, apiKey: string) => {
    const encrypted = safeStorage.encryptString(apiKey)
    fs.writeFileSync(claudeKeyPath, encrypted)
    claudeClient = new Anthropic({ apiKey })   // prime cache immediately
    return { ok: true }
  })

  ipcMain.handle('claude:key-status', async () => ({
    configured: fs.existsSync(claudeKeyPath),
  }))

  ipcMain.handle('claude:chat', async (_e, messages: unknown, system: string, tools: unknown) => {
    if (!claudeClient) {
      const encrypted = fs.readFileSync(claudeKeyPath)
      claudeClient = new Anthropic({ apiKey: safeStorage.decryptString(encrypted) })
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000)
    try {
      return await claudeClient.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 4096,
        system,
        tools: tools as Anthropic.Tool[],
        messages: messages as Anthropic.MessageParam[],
      }, { signal: controller.signal })
    } finally {
      clearTimeout(timeout)
    }
  })

  ipcMain.handle('python:setup-status', () => {
    // In E2E test mode, pretend Python is ready so the setup modal doesn't block tests.
    if (process.env['E2E_TEST'] === '1') return { ready: true }
    return { ready: isEnvReady() }
  })

  ipcMain.handle('python:run-setup', async () => {
    const win = getMainWindow()
    try {
      await runSetup(msg => win?.webContents.send('python:setup-progress', msg))
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

// ── Python sidecar ────────────────────────────────────────────────────────────

let sidecarProcess: ChildProcess | null = null
const sidecarPending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

function getSidecar(): ChildProcess {
  if (sidecarProcess && sidecarProcess.exitCode === null) return sidecarProcess

  if (!isEnvReady()) {
    throw new Error('Python environment is not set up. Open the app and complete the Python setup first.')
  }

  sidecarProcess = spawn(getPythonExe(), [getSidecarScriptPath()], { stdio: ['pipe', 'pipe', 'inherit'] })

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
    const timer = setTimeout(() => {
      if (sidecarPending.has(id)) {
        sidecarPending.delete(id)
        reject(new Error('Python sidecar timeout (30 s)'))
      }
    }, 30_000)
    sidecarPending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v) },
      reject:  (e) => { clearTimeout(timer); reject(e) },
    })
  })
})

export function cleanupSidecar(): void {
  if (sidecarProcess) {
    sidecarProcess.kill()
    sidecarProcess = null
  }
}

// ── Marimo notebook server ─────────────────────────────────────────────────────

let marimoProc: ChildProcess | null = null
let marimoPort: number | null = null
const MARIMO_CONTEXT_PATH = path.join(app.getPath('userData'), 'marimo_context.json')
const MARIMO_METRICS_PATH = path.join(app.getPath('userData'), 'marimo_metrics.csv')

function findFreePort(start: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(start, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port
      server.close(() => resolve(port))
    })
    server.on('error', () => {
      if (start >= 2800) reject(new Error('No free port found between 2718–2800'))
      else findFreePort(start + 1).then(resolve, reject)
    })
  })
}

async function waitForMarimoReady(port: number, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(1000),
      })
      if (res.status < 500) return
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error('Marimo server did not start within 30 seconds')
}

function seedNotebook(nbPath: string): void {
  if (fs.existsSync(nbPath)) return
  fs.mkdirSync(path.dirname(nbPath), { recursive: true })
  const content = `import marimo

__generated_with = "0.11.0"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo
    import pandas as pd
    import json
    import os
    return json, mo, os, pd


@app.cell
def _(json, mo, os, pd):
    _context_path = ${JSON.stringify(MARIMO_CONTEXT_PATH)}
    _metrics_path = ${JSON.stringify(MARIMO_METRICS_PATH)}

    _ctx = json.load(open(_context_path)) if os.path.exists(_context_path) else {}
    _df = pd.read_csv(_metrics_path) if os.path.exists(_metrics_path) else pd.DataFrame()

    mo.vstack([
        mo.md(f"## DesignCampaign — {len(_ctx.get('filtered_files', []))} filtered structures"),
        mo.md(f"**Folder:** \`{_ctx.get('current_folder', 'N/A')}\`  |  "
              f"**Active file:** \`{_ctx.get('active_file', 'N/A')}\`"),
        mo.ui.table(_df) if not _df.empty else mo.md("_No metrics loaded yet — open a folder with metrics in DesignCampaign._"),
    ])


if __name__ == "__main__":
    app.run()
`
  fs.writeFileSync(nbPath, content, 'utf-8')
}

ipcMain.handle('marimo:start', async (_evt, notebookPath: string) => {
  if (marimoProc && marimoProc.exitCode === null && marimoPort !== null) {
    return { port: marimoPort, contextPath: MARIMO_CONTEXT_PATH }
  }

  if (marimoProc) {
    marimoProc.kill()
    marimoProc = null
    marimoPort = null
  }

  seedNotebook(notebookPath)

  const port = await findFreePort(2718)
  const pythonExe = getPythonExe()

  marimoProc = spawn(
    pythonExe,
    ['-m', 'marimo', 'edit', '--headless', '--no-token', '--port', String(port), notebookPath],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )

  createInterface({ input: marimoProc.stderr! }).on('line', line => {
    if (line.trim()) console.log('[marimo]', line)
  })

  marimoProc.on('exit', (code, signal) => {
    console.log(`[marimo] process exited — code=${code} signal=${signal}`)
    marimoProc = null
    marimoPort = null
  })

  await waitForMarimoReady(port)
  marimoPort = port
  return { port, contextPath: MARIMO_CONTEXT_PATH }
})

ipcMain.handle('marimo:stop', () => {
  if (marimoProc) {
    marimoProc.kill()
    marimoProc = null
    marimoPort = null
  }
})

ipcMain.handle('marimo:status', () => ({
  running: marimoProc !== null && marimoProc.exitCode === null,
  port: marimoPort,
}))

ipcMain.handle('marimo:update-context', async (_evt, context: MarimoUpdateContext) => {
  fs.writeFileSync(MARIMO_CONTEXT_PATH, JSON.stringify(context, null, 2), 'utf-8')

  const { metricsRows: rows } = context
  if (rows.length > 0) {
    const allCols = Array.from(new Set(rows.flatMap(r => Object.keys(r.metrics))))
    const header = ['name', 'filePath', ...allCols].join(',')
    const lines = rows.map(r => {
      const vals = allCols.map(c => (r.metrics[c] === undefined ? '' : String(r.metrics[c])))
      return [`"${r.name}"`, `"${r.filePath ?? ''}"`, ...vals].join(',')
    })
    fs.writeFileSync(MARIMO_METRICS_PATH, [header, ...lines].join('\n'), 'utf-8')
  }

  return { contextPath: MARIMO_CONTEXT_PATH, metricsPath: MARIMO_METRICS_PATH }
})

export function cleanupMarimo(): void {
  if (marimoProc) {
    marimoProc.kill()
    marimoProc = null
    marimoPort = null
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
