#!/usr/bin/env node
/**
 * scripts/prepare-uv.mjs
 * Downloads the uv binary for the current build platform into uv-dist/.
 *
 * macOS (universal build):
 *   Saves two thin binaries — uv-dist/uv-x64 and uv-dist/uv-arm64.
 *   The afterpack.mjs hook renames the correct one to "uv" inside each
 *   arch-specific temp bundle so @electron/universal can lipo-merge them.
 *
 * Windows / Linux:
 *   Single-arch download saved directly as uv-dist/uv (or uv.exe).
 */
import https from 'node:https'
import { execSync } from 'node:child_process'
import {
  mkdirSync, existsSync, createWriteStream, rmSync,
  readdirSync, copyFileSync, chmodSync, statSync,
} from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')
const OUT_DIR = join(PROJECT_ROOT, 'uv-dist')
const IS_WIN = process.platform === 'win32'
const IS_MAC = process.platform === 'darwin'

async function fetchLatestVersion() {
  // Follow the /releases/latest redirect — the Location header contains the tag.
  // Avoids the 60 req/hour rate limit on the JSON API endpoint.
  return new Promise((resolve, reject) => {
    https.get(
      'https://github.com/astral-sh/uv/releases/latest',
      { headers: { 'User-Agent': 'designcampaign-build' } },
      res => {
        const loc = res.headers.location ?? ''
        const match = loc.match(/\/tag\/(.+)$/)
        if (match) { res.resume(); resolve(match[1]); return }
        reject(new Error(`Could not extract version from redirect location: "${loc}" (status ${res.statusCode})`))
      }
    ).on('error', reject)
  })
}

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    function get(u) {
      https.get(u, { headers: { 'User-Agent': 'designcampaign-build' } }, res => {
        if (res.statusCode === 301 || res.statusCode === 302) { get(res.headers.location); return }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return }
        const ws = createWriteStream(destPath)
        res.pipe(ws)
        ws.on('finish', resolve)
        ws.on('error', reject)
      }).on('error', reject)
    }
    get(url)
  })
}

function findBinary(dir, name) {
  const root = join(dir, name)
  if (existsSync(root)) return root
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      const nested = join(full, name)
      if (existsSync(nested)) return nested
    }
  }
  return null
}

/** Download a .tar.gz archive and extract the named binary. Returns path + cleanup fn. */
async function extractTarGz(url, binaryName, tag) {
  const tmpArchive = join(tmpdir(), `uv-download-${tag}.tar.gz`)
  const tmpExtract = join(tmpdir(), `uv-extract-${tag}-${Date.now()}`)
  const cleanup = () => {
    rmSync(tmpArchive, { force: true })
    rmSync(tmpExtract, { recursive: true, force: true })
  }
  try {
    await download(url, tmpArchive)
    mkdirSync(tmpExtract, { recursive: true })
    execSync(`tar xzf "${tmpArchive}" -C "${tmpExtract}"`)
    const found = findBinary(tmpExtract, binaryName)
    if (!found) throw new Error(`Could not locate ${binaryName} in ${tag} archive`)
    return { bin: found, cleanup }
  } catch (err) {
    cleanup()
    throw err
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  // ── macOS: save two THIN (single-arch) binaries — afterpack.mjs copies the
  //    correct one into each arch temp bundle before @electron/universal merges.
  //    Do NOT lipo-merge here: @electron/universal expects thin binaries in each
  //    half and performs the fat-binary creation itself.
  if (IS_MAC) {
    const x64Out   = join(OUT_DIR, 'uv-x64')
    const arm64Out = join(OUT_DIR, 'uv-arm64')

    if (existsSync(x64Out) && existsSync(arm64Out)) {
      console.log('[prepare-uv] macOS binaries already present:', OUT_DIR)
      return
    }

    console.log('[prepare-uv] Fetching latest uv version...')
    const version = await fetchLatestVersion()
    const base = `https://github.com/astral-sh/uv/releases/download/${version}`

    console.log(`[prepare-uv] Downloading uv ${version} for darwin (x64 + arm64)...`)
    const [x64, arm64] = await Promise.all([
      extractTarGz(`${base}/uv-x86_64-apple-darwin.tar.gz`,  'uv', 'x64'),
      extractTarGz(`${base}/uv-aarch64-apple-darwin.tar.gz`, 'uv', 'arm64'),
    ])
    try {
      copyFileSync(x64.bin,   x64Out);  chmodSync(x64Out,   0o755)
      copyFileSync(arm64.bin, arm64Out); chmodSync(arm64Out, 0o755)
      console.log('[prepare-uv] Done (macOS thin binaries):', OUT_DIR)
    } finally {
      x64.cleanup()
      arm64.cleanup()
    }
    return
  }

  // ── Windows / Linux: single-arch download.
  const OUT_BIN = join(OUT_DIR, IS_WIN ? 'uv.exe' : 'uv')
  if (existsSync(OUT_BIN)) {
    console.log('[prepare-uv] Binary already present:', OUT_BIN)
    return
  }

  console.log('[prepare-uv] Fetching latest uv version...')
  const version = await fetchLatestVersion()
  const base = `https://github.com/astral-sh/uv/releases/download/${version}`
  console.log(`[prepare-uv] Downloading uv ${version} for ${process.platform}/${process.arch}...`)

  if (IS_WIN) {
    const tmpArchive = join(tmpdir(), 'uv-download.zip')
    const tmpExtract = join(tmpdir(), `uv-extract-${Date.now()}`)
    try {
      await download(`${base}/uv-x86_64-pc-windows-msvc.zip`, tmpArchive)
      console.log('[prepare-uv] Extracting...')
      mkdirSync(tmpExtract, { recursive: true })
      execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${tmpArchive}' -DestinationPath '${tmpExtract}' -Force"`)
      const found = findBinary(tmpExtract, 'uv.exe')
      if (!found) throw new Error('Could not locate uv.exe in extracted archive')
      copyFileSync(found, OUT_BIN)
      console.log('[prepare-uv] Done:', OUT_BIN)
    } finally {
      rmSync(tmpArchive, { force: true })
      rmSync(tmpExtract, { recursive: true, force: true })
    }
  } else {
    const uvArch = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
    const { bin, cleanup } = await extractTarGz(
      `${base}/uv-${uvArch}-unknown-linux-gnu.tar.gz`, 'uv', 'linux'
    )
    try {
      copyFileSync(bin, OUT_BIN)
      chmodSync(OUT_BIN, 0o755)
      console.log('[prepare-uv] Done:', OUT_BIN)
    } finally {
      cleanup()
    }
  }
}

main().catch(err => { console.error('[prepare-uv]', err.message); process.exit(1) })
