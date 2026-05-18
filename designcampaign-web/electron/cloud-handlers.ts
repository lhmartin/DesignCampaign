/**
 * Cloud storage IPC handlers — Azure Blob Storage and Google Cloud Storage.
 *
 * Credentials are stored encrypted via Electron safeStorage, one file per
 * connection, mirroring the existing Claude API key pattern.
 *
 * Credential files:  <userData>/cloud-connections/<id>.enc
 * Connection index:  <userData>/cloud-connections/index.json  (non-sensitive)
 */

import { ipcMain, safeStorage, app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { ContainerClient } from '@azure/storage-blob'
import { Storage } from '@google-cloud/storage'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CloudConnectionMeta {
  id: string
  provider: 'azure' | 'gcs'
  label: string
  azureBaseUrl?: string   // base URL without SAS token, for display only
  azurePrefix?: string
  gcsBucket?: string
  gcsPrefix?: string
  gcsSaEmail?: string     // service account email, for display only
  createdAt: number
}

interface AzureSensitiveData {
  provider: 'azure'
  sasUrl: string
}

interface GcsSensitiveData {
  provider: 'gcs'
  serviceAccountJson: string
  bucket: string
}

type SensitiveData = AzureSensitiveData | GcsSensitiveData

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

interface FileInfo {
  name: string
  path: string
  size: number
  mtime: number
}

// ── Directory helpers ─────────────────────────────────────────────────────────

function getConnDir(): string {
  return path.join(app.getPath('userData'), 'cloud-connections')
}

function readIndex(): CloudConnectionMeta[] {
  const indexPath = path.join(getConnDir(), 'index.json')
  if (!fs.existsSync(indexPath)) return []
  try {
    return JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as CloudConnectionMeta[]
  } catch {
    return []
  }
}

function writeIndex(metas: CloudConnectionMeta[]): void {
  const dir = getConnDir()
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(metas, null, 2), 'utf-8')
}

function decryptSensitive(id: string): SensitiveData {
  const encPath = path.join(getConnDir(), `${id}.enc`)
  const encrypted = fs.readFileSync(encPath)
  return JSON.parse(safeStorage.decryptString(encrypted)) as SensitiveData
}

// ── SDK client caches ─────────────────────────────────────────────────────────

const azureClientCache = new Map<string, ContainerClient>()
const gcsClientCache = new Map<string, { storage: Storage; bucket: string }>()

function getAzureClient(id: string): ContainerClient {
  if (azureClientCache.has(id)) return azureClientCache.get(id)!
  const sensitive = decryptSensitive(id) as AzureSensitiveData
  const client = new ContainerClient(sensitive.sasUrl)
  azureClientCache.set(id, client)
  return client
}

function getGcsClient(id: string): { storage: Storage; bucket: string } {
  if (gcsClientCache.has(id)) return gcsClientCache.get(id)!
  const sensitive = decryptSensitive(id) as GcsSensitiveData
  const credentials = JSON.parse(sensitive.serviceAccountJson)
  const storage = new Storage({ credentials, projectId: credentials.project_id })
  const cached = { storage, bucket: sensitive.bucket }
  gcsClientCache.set(id, cached)
  return cached
}

// ── Blob listing helpers ──────────────────────────────────────────────────────

const STRUCTURE_EXTS = new Set(['.pdb', '.cif', '.mmcif', '.json'])

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i === -1 ? '' : name.slice(i).toLowerCase()
}

async function listAzureBlobs(sasUrl: string, prefix: string): Promise<FileInfo[]> {
  const client = new ContainerClient(sasUrl)
  const files: FileInfo[] = []
  for await (const blob of client.listBlobsFlat({ prefix: prefix || undefined })) {
    const ext = extOf(blob.name)
    if (!STRUCTURE_EXTS.has(ext)) continue
    const displayName = blob.name.includes('/') ? blob.name.split('/').pop()! : blob.name
    files.push({
      name: displayName,
      path: `cloud://azure/__ID__/${blob.name}`,
      size: blob.properties.contentLength ?? 0,
      mtime: 0,
    })
  }
  return files
}

async function listGcsObjects(serviceAccountJson: string, bucket: string, prefix: string): Promise<FileInfo[]> {
  const credentials = JSON.parse(serviceAccountJson)
  const storage = new Storage({ credentials, projectId: credentials.project_id })
  const [objects] = await storage.bucket(bucket).getFiles({ prefix: prefix || undefined, autoPaginate: true })
  const files: FileInfo[] = []
  for (const obj of objects) {
    const ext = extOf(obj.name)
    if (!STRUCTURE_EXTS.has(ext)) continue
    const displayName = obj.name.includes('/') ? obj.name.split('/').pop()! : obj.name
    files.push({
      name: displayName,
      path: `cloud://gcs/__ID__/${obj.name}`,
      size: Number(obj.metadata.size ?? 0),
      mtime: 0,
    })
  }
  return files
}

// ── IPC registration ──────────────────────────────────────────────────────────

export function registerCloudHandlers(): void {

  ipcMain.handle('cloud:list-connections', (): CloudConnectionMeta[] => {
    return readIndex()
  })

  ipcMain.handle('cloud:add-connection', async (_e, input: AddConnectionInput) => {
    // Refuse to store credentials when the OS keyring is unavailable — safeStorage
    // would otherwise silently fall back to plaintext obfuscation, which users
    // would reasonably mistake for real encryption.
    if (!safeStorage.isEncryptionAvailable()) {
      return {
        ok: false,
        error: 'OS keyring not available; refusing to store credentials in plaintext. '
             + 'Install/unlock a keyring (gnome-keyring, KWallet) and retry.',
      }
    }

    // Validate by running a lightweight test first
    const testResult = await runTest(input)
    if (!testResult.ok) return { ok: false, error: testResult.error }

    const id = 'conn_' + crypto.randomUUID().slice(0, 8)
    const dir = getConnDir()
    fs.mkdirSync(dir, { recursive: true })

    let sensitive: SensitiveData
    let meta: CloudConnectionMeta

    if (input.provider === 'azure') {
      sensitive = { provider: 'azure', sasUrl: input.sasUrl! }
      // Extract base URL (everything before the '?' query string) for display
      const baseUrl = input.sasUrl!.split('?')[0]
      meta = {
        id,
        provider: 'azure',
        label: input.label,
        azureBaseUrl: baseUrl,
        azurePrefix: input.azurePrefix || undefined,
        createdAt: Date.now(),
      }
    } else {
      // runTest already validated this parses; one more parse here to read
      // client_email for the display meta.
      const saJson = JSON.parse(input.serviceAccountJson!) as { client_email?: string }
      sensitive = { provider: 'gcs', serviceAccountJson: input.serviceAccountJson!, bucket: input.gcsBucket! }
      meta = {
        id,
        provider: 'gcs',
        label: input.label,
        gcsBucket: input.gcsBucket,
        gcsPrefix: input.gcsPrefix || undefined,
        gcsSaEmail: saJson.client_email,
        createdAt: Date.now(),
      }
    }

    const encrypted = safeStorage.encryptString(JSON.stringify(sensitive))
    fs.writeFileSync(path.join(dir, `${id}.enc`), encrypted)

    const connections = readIndex()
    connections.push(meta)
    writeIndex(connections)

    return { ok: true, id }
  })

  ipcMain.handle('cloud:delete-connection', (_e, { id }: { id: string }) => {
    const encPath = path.join(getConnDir(), `${id}.enc`)
    if (fs.existsSync(encPath)) fs.unlinkSync(encPath)
    const connections = readIndex().filter(c => c.id !== id)
    writeIndex(connections)
    azureClientCache.delete(id)
    gcsClientCache.delete(id)
    return { ok: true }
  })

  ipcMain.handle('cloud:test-connection', async (_e, input: TestConnectionInput) => {
    return runTest(input)
  })

  ipcMain.handle('cloud:list-files', async (_e, { id }: { id: string }): Promise<FileInfo[]> => {
    const connections = readIndex()
    const meta = connections.find(c => c.id === id)
    if (!meta) throw new Error(`Cloud connection not found: ${id}`)

    const sensitive = decryptSensitive(id)

    let files: FileInfo[]
    if (sensitive.provider === 'azure') {
      files = await listAzureBlobs(sensitive.sasUrl, meta.azurePrefix ?? '')
    } else {
      files = await listGcsObjects(sensitive.serviceAccountJson, sensitive.bucket, meta.gcsPrefix ?? '')
    }

    return files.map(f => ({ ...f, path: f.path.replace('__ID__', id) }))
  })

  ipcMain.handle('cloud:read-file', async (_e, { path: virtualPath }: { path: string }): Promise<string> => {
    if (!virtualPath.startsWith('cloud://')) {
      throw new Error(`Not a cloud path: ${virtualPath}`)
    }
    const withoutScheme = virtualPath.slice('cloud://'.length)
    const firstSlash = withoutScheme.indexOf('/')
    const secondSlash = withoutScheme.indexOf('/', firstSlash + 1)
    if (firstSlash === -1 || secondSlash === -1) {
      throw new Error(`Malformed cloud path: ${virtualPath}`)
    }
    const provider = withoutScheme.slice(0, firstSlash) as 'azure' | 'gcs'
    const connectionId = withoutScheme.slice(firstSlash + 1, secondSlash)
    const blobName = withoutScheme.slice(secondSlash + 1)

    // Cross-check the path's connection id against the index so a stale URL
    // produces a clear error rather than an opaque ENOENT from decryptSensitive.
    const meta = readIndex().find(c => c.id === connectionId)
    if (!meta) throw new Error(`Cloud connection not found: ${connectionId}`)
    if (meta.provider !== provider) {
      throw new Error(`Provider mismatch for ${connectionId}: path says ${provider}, stored as ${meta.provider}`)
    }

    if (provider === 'azure') {
      const client = getAzureClient(connectionId)
      const download = await client.getBlobClient(blobName).downloadToBuffer()
      return download.toString('utf-8')
    } else {
      const { storage, bucket } = getGcsClient(connectionId)
      const [contents] = await storage.bucket(bucket).file(blobName).download()
      return contents.toString('utf-8')
    }
  })
}

// ── Test helper (shared by add + test handlers) ───────────────────────────────

async function runTest(input: TestConnectionInput): Promise<{ ok: boolean; error?: string; fileCount?: number }> {
  try {
    if (input.provider === 'azure') {
      if (!input.sasUrl) return { ok: false, error: 'SAS URL is required' }
      const client = new ContainerClient(input.sasUrl)
      let count = 0
      for await (const _ of client.listBlobsFlat({ prefix: input.azurePrefix || undefined })) {
        count++
        if (count >= 5) break  // only need a few to confirm access
      }
      return { ok: true, fileCount: count }
    } else {
      if (!input.serviceAccountJson) return { ok: false, error: 'Service account JSON is required' }
      if (!input.gcsBucket) return { ok: false, error: 'Bucket name is required' }
      const credentials = JSON.parse(input.serviceAccountJson)
      const storage = new Storage({ credentials, projectId: credentials.project_id })
      const [files] = await storage.bucket(input.gcsBucket).getFiles({
        prefix: input.gcsPrefix || undefined,
        maxResults: 5,
        autoPaginate: false,
      })
      return { ok: true, fileCount: files.length }
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
