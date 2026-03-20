#!/usr/bin/env node
/**
 * scripts/prepare-uv.mjs
 * Downloads the uv binary for the current build platform into uv-dist/.
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
  const json = await httpsGetText('https://api.github.com/repos/astral-sh/uv/releases/latest')
  return JSON.parse(json).tag_name
}

function getAsset(version) {
  const base = `https://github.com/astral-sh/uv/releases/download/${version}`
  const { platform, arch } = process
  const uvArch = arch === 'arm64' ? 'aarch64' : 'x86_64'
  if (platform === 'win32')   return { url: `${base}/uv-x86_64-pc-windows-msvc.zip`,          ext: '.zip'    }
  if (platform === 'darwin')  return { url: `${base}/uv-${uvArch}-apple-darwin.tar.gz`,        ext: '.tar.gz' }
  return                               { url: `${base}/uv-${uvArch}-unknown-linux-gnu.tar.gz`, ext: '.tar.gz' }
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

async function main() {
  if (existsSync(OUT_BIN)) {
    console.log('[prepare-uv] Binary already present:', OUT_BIN)
    return
  }

  console.log(`[prepare-uv] Fetching latest uv version...`)
  const version = await fetchLatestVersion()
  console.log(`[prepare-uv] Downloading uv ${version} for ${process.platform}/${process.arch}...`)

  const { url, ext } = getAsset(version)
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

    mkdirSync(OUT_DIR, { recursive: true })
    copyFileSync(found, OUT_BIN)
    if (!IS_WIN) chmodSync(OUT_BIN, 0o755)

    console.log('[prepare-uv] Done:', OUT_BIN)
  } finally {
    if (existsSync(tmpArchive)) rmSync(tmpArchive, { force: true })
    if (existsSync(tmpExtract)) rmSync(tmpExtract, { recursive: true, force: true })
  }
}

main().catch(err => { console.error('[prepare-uv]', err.message); process.exit(1) })
