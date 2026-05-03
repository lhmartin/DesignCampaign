import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useFileStore } from '@/stores/file-store'
import type { CloudConnectionMeta } from '@/types/electron'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFileInfo(name: string, path: string) {
  return { name, path, size: 1000, mtime: 0 }
}

const CONN_META: CloudConnectionMeta = {
  id: 'conn_abc123',
  provider: 'azure',
  label: 'Test Blob',
  azureBaseUrl: 'https://account.blob.core.windows.net/container',
  createdAt: 1000000,
}

// Cloud files returned by the mock: two structure files + a JSON sidecar
const CLOUD_FILES = [
  makeFileInfo('protein_001.pdb', 'cloud://azure/conn_abc123/protein_001.pdb'),
  makeFileInfo('protein_002.cif', 'cloud://azure/conn_abc123/protein_002.cif'),
  makeFileInfo('protein_001.json', 'cloud://azure/conn_abc123/protein_001.json'),
]

function makeElectronMock() {
  return {
    cloudListConnections: vi.fn().mockResolvedValue([CONN_META]),
    cloudListFiles: vi.fn().mockResolvedValue(CLOUD_FILES),
    listFiles: vi.fn().mockResolvedValue([
      makeFileInfo('local.pdb', '/data/local.pdb'),
    ]),
    openFolder: vi.fn(),
  } as unknown as typeof window.electronAPI
}

beforeEach(() => {
  // Reset store to initial state before each test
  useFileStore.setState({
    currentFolder: null,
    files: [],
    allCloudFiles: [],
    activeFile: null,
    isScanning: false,
    error: null,
  })
})

afterEach(() => {
  window.electronAPI = undefined as unknown as typeof window.electronAPI
})

// ── openCloudConnection ───────────────────────────────────────────────────────

describe('openCloudConnection', () => {
  it('sets currentFolder to the virtual cloud path', async () => {
    window.electronAPI = makeElectronMock()

    await useFileStore.getState().openCloudConnection('conn_abc123')

    expect(useFileStore.getState().currentFolder).toBe('cloud://azure/conn_abc123')
  })

  it('puts structure files in files and all blobs in allCloudFiles', async () => {
    window.electronAPI = makeElectronMock()

    await useFileStore.getState().openCloudConnection('conn_abc123')

    const { files, allCloudFiles } = useFileStore.getState()
    // Only structure files (.pdb, .cif) go into files
    expect(files).toHaveLength(2)
    expect(files.map(f => f.name)).toEqual(expect.arrayContaining(['protein_001.pdb', 'protein_002.cif']))
    // All blobs (including .json sidecar) go into allCloudFiles
    expect(allCloudFiles).toHaveLength(3)
    expect(allCloudFiles.map(f => f.name)).toContain('protein_001.json')
  })

  it('sets isScanning false after completion', async () => {
    window.electronAPI = makeElectronMock()

    await useFileStore.getState().openCloudConnection('conn_abc123')

    expect(useFileStore.getState().isScanning).toBe(false)
  })

  it('sets error when connection id is not found', async () => {
    const api = makeElectronMock()
    ;(api.cloudListConnections as ReturnType<typeof vi.fn>).mockResolvedValue([])
    window.electronAPI = api

    await useFileStore.getState().openCloudConnection('conn_nonexistent')

    expect(useFileStore.getState().error).toMatch(/not found/)
    expect(useFileStore.getState().isScanning).toBe(false)
  })
})

// ── setFolder — cloud routing ─────────────────────────────────────────────────

describe('setFolder — cloud path routing', () => {
  it('calls openCloudConnection when folder is a cloud:// path', async () => {
    window.electronAPI = makeElectronMock()

    await useFileStore.getState().setFolder('cloud://azure/conn_abc123')

    // currentFolder updated to virtual cloud path (set inside openCloudConnection)
    expect(useFileStore.getState().currentFolder).toBe('cloud://azure/conn_abc123')
    // listFiles (local IPC) must NOT have been called
    expect((window.electronAPI!.listFiles as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
  })

  it('calls listFiles for a local folder path', async () => {
    window.electronAPI = makeElectronMock()

    await useFileStore.getState().setFolder('/data/designs')

    expect((window.electronAPI!.listFiles as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      '/data/designs',
      expect.any(Array),
    )
    expect(useFileStore.getState().currentFolder).toBe('/data/designs')
  })
})

// ── refreshFiles ──────────────────────────────────────────────────────────────

describe('refreshFiles', () => {
  it('re-invokes openCloudConnection when currentFolder is a cloud path', async () => {
    window.electronAPI = makeElectronMock()

    // Seed state as if we already opened a cloud connection
    useFileStore.setState({ currentFolder: 'cloud://azure/conn_abc123' })

    await useFileStore.getState().refreshFiles()

    expect((window.electronAPI!.cloudListFiles as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('conn_abc123')
  })

  it('calls setFolder for a local currentFolder', async () => {
    window.electronAPI = makeElectronMock()

    useFileStore.setState({ currentFolder: '/data/designs' })

    await useFileStore.getState().refreshFiles()

    expect((window.electronAPI!.listFiles as ReturnType<typeof vi.fn>)).toHaveBeenCalled()
    expect((window.electronAPI!.cloudListFiles as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
  })

  it('is a no-op when currentFolder is null', async () => {
    window.electronAPI = makeElectronMock()

    await useFileStore.getState().refreshFiles()

    expect((window.electronAPI!.cloudListFiles as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
    expect((window.electronAPI!.listFiles as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
  })
})
