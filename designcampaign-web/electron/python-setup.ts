import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

// ── Path helpers ──────────────────────────────────────────────────────────────

/** Base directory for bundled resources (differs between dev and production). */
function resourceRoot(): string {
  return app.isPackaged ? process.resourcesPath : app.getAppPath()
}

/** Path to the bundled uv binary. */
export function getUvPath(): string {
  const bin = process.platform === 'win32' ? 'uv.exe' : 'uv'
  const bundled = path.join(resourceRoot(), 'uv-dist', bin)
  if (fs.existsSync(bundled)) return bundled
  // Dev fallback: use uv from PATH (for developers who have uv installed globally)
  return bin
}

/** Path to the sidecar Python script. */
export function getSidecarScriptPath(): string {
  return path.join(resourceRoot(), 'python', 'sidecar.py')
}

/** Directory in userData where the managed Python project lives. */
function getPythonProjectDir(): string {
  return path.join(app.getPath('userData'), 'python-env')
}

/** Path to the Python executable inside the managed venv. */
export function getPythonExe(): string {
  const venv = path.join(getPythonProjectDir(), '.venv')
  return process.platform === 'win32'
    ? path.join(venv, 'Scripts', 'python.exe')
    : path.join(venv, 'bin', 'python3')
}

/** Returns true if the managed venv Python executable exists. */
export function isEnvReady(): boolean {
  return fs.existsSync(getPythonExe())
}

// ── Setup ─────────────────────────────────────────────────────────────────────

/**
 * Create or update the Python environment using uv.
 * Streams human-readable progress lines to `onProgress`.
 */
export async function runSetup(onProgress: (msg: string) => void): Promise<void> {
  const uvPath = getUvPath()
  if (!fs.existsSync(uvPath) && uvPath !== 'uv' && uvPath !== 'uv.exe') {
    throw new Error(
      `uv binary not found at ${uvPath}. Please reinstall the application.`,
    )
  }

  const projectDir = getPythonProjectDir()
  fs.mkdirSync(projectDir, { recursive: true })

  // Copy pyproject.toml from app resources into the userData project dir
  const pyprojectSrc = path.join(resourceRoot(), 'python', 'pyproject.toml')
  const pyprojectDst = path.join(projectDir, 'pyproject.toml')
  fs.copyFileSync(pyprojectSrc, pyprojectDst)

  onProgress('Creating Python 3.11 environment with uv…')

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      uvPath,
      ['sync', '--directory', projectDir, '--python', '3.11', '--no-dev'],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, UV_PYTHON_DOWNLOADS: 'automatic' },
      },
    )

    const onLine = (line: string) => { if (line.trim()) onProgress(line.trim()) }
    createInterface({ input: proc.stdout! }).on('line', onLine)
    createInterface({ input: proc.stderr! }).on('line', onLine)

    proc.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`uv exited with code ${code}`))
    })
    proc.on('error', err =>
      reject(new Error(`Failed to launch uv: ${err.message}`)),
    )
  })

  onProgress('Python environment ready.')
}
