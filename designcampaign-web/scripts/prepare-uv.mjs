#!/usr/bin/env node
/**
 * scripts/prepare-uv.mjs
 * Downloads the uv binary for the current build platform into uv-dist/.
 * On macOS, downloads both x64 and arm64 binaries and merges them with
 * `lipo` to produce a universal binary (required by electron-builder's
 * macOS universal target).
 * Run automatically before electron-builder via npm scripts.
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
const OUT_BIN = join(OUT_DIR, IS_WIN ? 'uv.exe' : 'uv')

function httpsGetText(url) {
  return new Promise((resolve, reject) => {
    function get(u) {
      https.get(u, { headers: { 'User-Agent': 'designcampaign-build' } }, res => {
        if (res.statusCode === 301 || res.statusCode === 302) { get(res.headers.location); return }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode} for ${u}`)); return }
        let data = ''
        res.on('data', c => { data += c })
        res.on('end', () => resolve(data))
      }).on('error', reject)
    }
    get(url)
  })
}

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
  // Check root first
  const root = join(dir, name)
  if (existsSync(root)) return root
  // Look one level deeper (archive may have a subdirectory)
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      const nested = join(full, name)
      if (existsSync(nested)) return nested
    }
  }
  return null
}

/** Extract a single uv binary from a tar.gz archive into a temp dir. */
async function extractArchive(url, tag) {
  const tmpArchive = join(tmpdir(), `uv-download-${tag}.tar.gz`)
  const tmpExtract = join(tmpdir(), `uv-extract-${tag}-${Date.now()}`)
  try {
    await download(url, tmpArchive)
    mkdirSync(tmpExtract, { recursive: true })
    execSync(`tar xzf "${tmpArchive}" -C "${tmpExtract}"`)
    const found = findBinary(tmpExtract, 'uv')
    if (!found) throw new Error(`Could not locate uv in ${tag} archive`)
    return { bin: found, cleanup: () => {
      rmSync(tmpArchive, { force: true })
      rmSync(tmpExtract, { recursive: true, force: true })
    }}
  } catch (err) {
    rmSync(tmpArchive, { force: true })
    rmSync(tmpExtract, { recursive: true, force: true })
    throw err
  }
}

async function main() {
  if (existsSync(OUT_BIN)) {
    console.log('[prepare-uv] Binary already present:', OUT_BIN)
    return
  }

  console.log('[prepare-uv] Fetching latest uv version...')
  const version = await fetchLatestVersion()
  const base = `https://github.com/astral-sh/uv/releases/download/${version}`

  mkdirSync(OUT_DIR, { recursive: true })

  // ── macOS: build a universal (fat) binary so electron-builder's universal
  //    target accepts it — a single-arch binary causes a packaging error.
  if (process.platform === 'darwin') {
    console.log(`[prepare-uv] Downloading uv ${version} for darwin (universal)...`)
    const [x64, arm64] = await Promise.all([
      extractArchive(`${base}/uv-x86_64-apple-darwin.tar.gz`,   'x64'),
      extractArchive(`${base}/uv-aarch64-apple-darwin.tar.gz`, 'arm64'),
    ])
    try {
      execSync(`lipo -create "${x64.bin}" "${arm64.bin}" -output "${OUT_BIN}"`)
      chmodSync(OUT_BIN, 0o755)
      console.log('[prepare-uv] Done (universal):', OUT_BIN)
    } finally {
      x64.cleanup()
      arm64.cleanup()
    }
    return
  }

  // ── Windows / Linux: single-arch download
  console.log(`[prepare-uv] Downloading uv ${version} for ${process.platform}/${process.arch}...`)

  const { url, ext } = (() => {
    const uvArch = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
    if (IS_WIN) return { url: `${base}/uv-x86_64-pc-windows-msvc.zip`,          ext: '.zip'    }
    return              { url: `${base}/uv-${uvArch}-unknown-linux-gnu.tar.gz`, ext: '.tar.gz' }
  })()

  const tmpArchive = join(tmpdir(), `uv-download${ext}`)
  const tmpExtract = join(tmpdir(), `uv-extract-${Date.now()}`)

  try {
    await download(url, tmpArchive)
    console.log('[prepare-uv] Extracting...')

    mkdirSync(tmpExtract, { recursive: true })
    if (IS_WIN) {
      execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${tmpArchive}' -DestinationPath '${tmpExtract}' -Force"`)
    } else {
      execSync(`tar xzf "${tmpArchive}" -C "${tmpExtract}"`)
    }

    const binName = IS_WIN ? 'uv.exe' : 'uv'
    const found = findBinary(tmpExtract, binName)
    if (!found) throw new Error(`Could not locate ${binName} in extracted archive`)

    copyFileSync(found, OUT_BIN)
    if (!IS_WIN) chmodSync(OUT_BIN, 0o755)

    console.log('[prepare-uv] Done:', OUT_BIN)
  } finally {
    rmSync(tmpArchive, { force: true })
    rmSync(tmpExtract, { recursive: true, force: true })
  }
}

main().catch(err => { console.error('[prepare-uv]', err.message); process.exit(1) })
