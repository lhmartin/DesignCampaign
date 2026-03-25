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
    files.sort((a, b) => a.name.localeCompare(b.name))
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

  sidecarProcess = spawn(getPythonExe(), [getSidecarScriptPath()], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })

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
let marimoStarting = false
const isMarimoRunning = () => marimoProc !== null && marimoProc.exitCode === null
const MARIMO_CONTEXT_PATH = path.join(app.getPath('userData'), 'marimo_context.json')
const MARIMO_METRICS_PATH = path.join(app.getPath('userData'), 'marimo_metrics.csv')


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
def _(json, os, pd):
    # ctx  — full app state (active_file, current_folder, filtered_files, filters, ranking)
    # df   — metrics table matching what DesignCampaign shows (name, filePath, all numeric columns)
    _context_path = os.environ.get("DESIGNCAMPAIGN_CONTEXT_PATH", "")
    _metrics_path = os.environ.get("DESIGNCAMPAIGN_METRICS_PATH", "")
    ctx = json.load(open(_context_path)) if _context_path and os.path.exists(_context_path) else {}
    df = pd.read_csv(_metrics_path) if _metrics_path and os.path.exists(_metrics_path) else pd.DataFrame()
    return ctx, df


@app.cell
def _(ctx, df, mo):
    mo.vstack([
        mo.md(f"## DesignCampaign — {len(ctx.get('filtered_files', []))} filtered structures"),
        mo.md(f"**Folder:** \`{ctx.get('current_folder', 'N/A')}\`  |  "
              f"**Active file:** \`{ctx.get('active_file', 'N/A')}\`"),
        mo.ui.table(df) if not df.empty else mo.md("_No metrics loaded yet — open a folder with metrics in DesignCampaign._"),
    ])


if __name__ == "__main__":
    app.run()
`
  fs.writeFileSync(nbPath, content, 'utf-8')
}

ipcMain.handle('marimo:start', async (_evt, notebookPath: string) => {
  if (isMarimoRunning() && marimoPort !== null) {
    return { port: marimoPort, contextPath: MARIMO_CONTEXT_PATH }
  }
  // Serialize concurrent starts — a second call while the first is still
  // starting would otherwise race to overwrite marimoProc/marimoPort.
  if (marimoStarting) throw new Error('Marimo is already starting')
  marimoStarting = true

  try {
  if (marimoProc) {
    marimoProc.kill()
    marimoProc = null
    marimoPort = null
  }

  seedNotebook(notebookPath)

  // Ask the OS for a free port by listening on 0, then immediately close.
  // This minimises (but does not eliminate) the window in which another
  // process could claim the port before Marimo binds it.
  const portServer = net.createServer()
  const port = await new Promise<number>((resolve, reject) => {
    portServer.once('listening', () => resolve((portServer.address() as net.AddressInfo).port))
    portServer.once('error', reject)
    portServer.listen(0, '127.0.0.1') // 0 = OS-assigned free port
  })
  await new Promise<void>(r => portServer.close(() => r()))

  const pythonExe = getPythonExe()

  marimoProc = spawn(
    pythonExe,
    ['-m', 'marimo', 'edit', '--headless', '--no-token', '--port', String(port), notebookPath],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      // Only expose safe env vars — avoid leaking API keys or secrets.
      // Cast via spread so TS's ProcessEnv augmentation doesn't complain.
      env: {
        ...({} as NodeJS.ProcessEnv),
        PATH: process.env['PATH'],
        HOME: process.env['HOME'],
        USERPROFILE: process.env['USERPROFILE'],
        APPDATA: process.env['APPDATA'],
        TEMP: process.env['TEMP'],
        TMPDIR: process.env['TMPDIR'],
        DESIGNCAMPAIGN_CONTEXT_PATH: MARIMO_CONTEXT_PATH,
        DESIGNCAMPAIGN_METRICS_PATH: MARIMO_METRICS_PATH,
      } satisfies NodeJS.ProcessEnv,
    },
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
  } finally {
    marimoStarting = false
  }
})

ipcMain.handle('marimo:stop', () => {
  if (marimoProc) {
    marimoProc.kill()
    marimoProc = null
    marimoPort = null
  }
})

ipcMain.handle('marimo:status', () => ({
  running: isMarimoRunning(),
  port: marimoPort,
}))

// RFC 4180: wrap in double-quotes and escape internal quotes by doubling them.
function csvCell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`
}

const CONTEXT_MAX_BYTES = 50 * 1024 * 1024 // 50 MB guard

ipcMain.handle('marimo:update-context', async (_evt, context: MarimoUpdateContext) => {
  // Check compact size first to avoid materialising a large pretty-printed string
  // only to throw it away.
  if (Buffer.byteLength(JSON.stringify(context), 'utf-8') > CONTEXT_MAX_BYTES) {
    throw new Error('marimo:update-context payload exceeds 50 MB limit')
  }
  fs.writeFileSync(MARIMO_CONTEXT_PATH, JSON.stringify(context, null, 2), 'utf-8')

  const { metricsRows: rows } = context
  if (rows.length > 0) {
    const allCols = Array.from(new Set(rows.flatMap(r => Object.keys(r.metrics))))
    // Quote all header fields — column names may contain commas or spaces.
    const header = ['name', 'filePath', ...allCols].map(csvCell).join(',')
    const lines = rows.map(r => {
      const vals = allCols.map(c => (r.metrics[c] === undefined ? '' : String(r.metrics[c])))
      return [csvCell(r.name), csvCell(r.filePath ?? ''), ...vals].join(',')
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
