import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FileInfo } from '@/types/electron'
import { APP_DEFAULTS } from '@/lib/constants/app'
import { isCloudPath, parseCloudPath } from '@/lib/cloud-paths'

interface FileStore {
  currentFolder: string | null
  files: FileInfo[]
  allCloudFiles: FileInfo[]   // full cloud listing incl .json sidecars; empty for local folders
  activeFile: string | null
  isScanning: boolean
  error: string | null

  openFolder: () => Promise<void>
  openCloudConnection: (id: string) => Promise<void>
  refreshFiles: () => Promise<void>
  setActiveFile: (path: string | null) => void
  setFolder: (folder: string) => Promise<void>
}

const STRUCTURE_EXTS = new Set(['.pdb', '.cif', '.mmcif'])

export const useFileStore = create<FileStore>()(
  persist(
    (set, get) => ({
  currentFolder: null,
  files: [],
  allCloudFiles: [],
  activeFile: null,
  isScanning: false,
  error: null,

  openFolder: async () => {
    if (window.electronAPI) {
      try {
        const folder = await window.electronAPI.openFolder()
        if (!folder) return
        await get().setFolder(folder)
      } catch (err) {
        set({ error: err instanceof Error ? err.message : 'Failed to open folder' })
      }
    } else if ('showDirectoryPicker' in window) {
      // Browser fallback using File System Access API
      try {
        const dirHandle = await (window as Window & { showDirectoryPicker(): Promise<FileSystemDirectoryHandle> }).showDirectoryPicker()
        const files: Array<{ name: string; path: string; size: number; mtime: number }> = []
        const exts = APP_DEFAULTS.SUPPORTED_FORMATS.map((e: string) => e.toLowerCase())
        async function scanDir(handle: FileSystemDirectoryHandle, prefix: string) {
          for await (const [name, entry] of handle.entries()) {
            if (entry.kind === 'file') {
              const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
              if (exts.includes(ext)) {
                const file = await (entry as FileSystemFileHandle).getFile()
                files.push({ name, path: prefix ? `${prefix}/${name}` : name, size: file.size, mtime: file.lastModified })
              }
            } else if (entry.kind === 'directory') {
              await scanDir(entry as FileSystemDirectoryHandle, prefix ? `${prefix}/${name}` : name)
            }
          }
        }
        await scanDir(dirHandle, '')
        files.sort((a, b) => a.name.localeCompare(b.name))
        set({ currentFolder: dirHandle.name, files, isScanning: false, error: null })
        ;(window as Window & { __dirHandle?: FileSystemDirectoryHandle }).__dirHandle = dirHandle
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          set({ error: err.message })
        }
      }
    }
  },

  openCloudConnection: async (id: string) => {
    if (!window.electronAPI) return
    set({ isScanning: true, error: null, files: [], allCloudFiles: [] })
    try {
      const connections = await window.electronAPI.cloudListConnections()
      const conn = connections.find(c => c.id === id)
      if (!conn) { set({ isScanning: false, error: `Cloud connection not found: ${id}` }); return }
      set({ currentFolder: `cloud://${conn.provider}/${id}` })
      const all = await window.electronAPI.cloudListFiles(id)
      const structureFiles = all.filter(f => {
        const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
        return STRUCTURE_EXTS.has(ext)
      })
      set({ files: structureFiles, allCloudFiles: all, isScanning: false })
    } catch (err) {
      set({ isScanning: false, error: err instanceof Error ? err.message : 'Failed to list cloud files' })
    }
  },

  setFolder: async (folder: string) => {
    if (!window.electronAPI) return
    if (isCloudPath(folder)) {
      const { connectionId } = parseCloudPath(folder)
      await get().openCloudConnection(connectionId)
      return
    }
    set({ currentFolder: folder, isScanning: true, error: null, files: [], allCloudFiles: [] })
    try {
      const files = await window.electronAPI.listFiles(
        folder,
        APP_DEFAULTS.SUPPORTED_FORMATS as unknown as string[]
      )
      set({ files, isScanning: false })
    } catch (err) {
      set({
        isScanning: false,
        error: err instanceof Error ? err.message : 'Failed to scan folder',
      })
    }
  },

  refreshFiles: async () => {
    const { currentFolder } = get()
    if (!currentFolder) return
    if (isCloudPath(currentFolder)) {
      const { connectionId } = parseCloudPath(currentFolder)
      await get().openCloudConnection(connectionId)
      return
    }
    await get().setFolder(currentFolder)
  },

  setActiveFile: (path: string | null) => {
    set({ activeFile: path })
  },
    }),
    {
      name: 'dc-file-store',
      partialize: (s) => ({ currentFolder: s.currentFolder, activeFile: s.activeFile }),
    },
  ),
)
