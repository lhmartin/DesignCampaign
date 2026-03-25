import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FileInfo } from '@/types/electron'
import { parseChainSequences } from '@/lib/parsers/pdb-sequence'

const DB_NAME = 'dc-seq-cache-v1'
const STORE_NAME = 'hashes'
let _db: IDBDatabase | null = null

async function openDB(): Promise<IDBDatabase> {
  if (_db) return _db
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME, { keyPath: 'path' })
    req.onsuccess = () => { _db = req.result; resolve(req.result) }
    req.onerror = () => reject(req.error)
  })
}

async function dbGet(path: string, mtime: number): Promise<ChainHashResult | null> {
  const db = await openDB()
  return new Promise((resolve) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(path)
    req.onsuccess = () => {
      const r = req.result as ChainHashResult | undefined
      resolve(r && r.mtime === mtime ? r : null)
    }
    req.onerror = () => resolve(null)
  })
}

async function dbPut(result: ChainHashResult): Promise<void> {
  const db = await openDB()
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(result)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

async function hashSeq(seq: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seq))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12)
}

export interface ChainHashResult {
  path: string
  mtime: number
  chainHashes: Record<string, string>  // chainId → 12-char hex
}

export interface StructureGroup {
  id: string           // target hash key (sorted hashes joined by ':')
  targetHash: string   // first target hash (for display)
  label: string
  members: string[]
  isExpanded: boolean
}

interface GroupStore {
  hashResults: Map<string, ChainHashResult>
  groups: StructureGroup[]
  ungrouped: string[]
  isGrouping: boolean
  progress: number   // 0–1
  viewMode: 'tree' | 'groups'
  /** The files array that was last passed to startGrouping — used to skip re-grouping on component remount. */
  lastGroupedFiles: FileInfo[] | null
  startGrouping: (files: FileInfo[], readFile: (path: string) => Promise<string>) => Promise<void>
  clearGroups: () => void
  toggleGroup: (id: string) => void
  setViewMode: (mode: 'tree' | 'groups') => void
}

function computeGroups(hashResults: Map<string, ChainHashResult>): {
  groups: StructureGroup[]
  ungrouped: string[]
} {
  const total = hashResults.size
  if (total === 0) return { groups: [], ungrouped: [] }

  // Count frequency of each chain hash
  const freq = new Map<string, number>()
  for (const { chainHashes } of hashResults.values()) {
    for (const h of Object.values(chainHashes)) {
      freq.set(h, (freq.get(h) ?? 0) + 1)
    }
  }

  // Hashes in >50% of structures are "target" hashes
  const threshold = total * 0.5
  const targetHashes = new Set(
    Array.from(freq.entries()).filter(([, c]) => c > threshold).map(([h]) => h),
  )

  // Build hash → most-common chain ID mapping so labels show chain IDs, not hashes.
  const hashToChainId = new Map<string, Map<string, number>>()
  for (const { chainHashes } of hashResults.values()) {
    for (const [chainId, h] of Object.entries(chainHashes)) {
      if (!hashToChainId.has(h)) hashToChainId.set(h, new Map())
      const counts = hashToChainId.get(h)!
      counts.set(chainId, (counts.get(chainId) ?? 0) + 1)
    }
  }
  const dominantChainId = (h: string): string => {
    const counts = hashToChainId.get(h)
    if (!counts) return h.slice(0, 4)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }

  const groupMap = new Map<string, string[]>()
  const ungrouped: string[] = []

  for (const { path, chainHashes } of hashResults.values()) {
    const tHashes = Object.values(chainHashes).filter(h => targetHashes.has(h)).sort()
    if (tHashes.length === 0) {
      ungrouped.push(path)
    } else {
      const key = tHashes.join(':')
      if (!groupMap.has(key)) groupMap.set(key, [])
      groupMap.get(key)!.push(path)
    }
  }

  const groups: StructureGroup[] = Array.from(groupMap.entries()).map(([key, members]) => {
    const chainIds = key.split(':').map(dominantChainId).join('+')
    return {
      id: key,
      targetHash: key.split(':')[0],
      label: `Target (${chainIds})`,
      members: members.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      isExpanded: true,
    }
  })

  groups.sort((a, b) => b.members.length - a.members.length)
  return { groups, ungrouped: ungrouped.sort() }
}

export const useGroupStore = create<GroupStore>()(
  persist(
    (set, get) => ({
  hashResults: new Map(),
  groups: [],
  ungrouped: [],
  isGrouping: false,
  progress: 0,
  viewMode: 'tree',
  lastGroupedFiles: null,

  clearGroups: () => set({ hashResults: new Map(), groups: [], ungrouped: [], progress: 0, isGrouping: false, lastGroupedFiles: null }),

  toggleGroup: (id) =>
    set(s => ({
      groups: s.groups.map(g => g.id === id ? { ...g, isExpanded: !g.isExpanded } : g),
    })),

  setViewMode: (mode) => set({ viewMode: mode }),

  startGrouping: async (files, readFile) => {
    // Same file array reference → already grouped (or in progress). Bail out.
    // This prevents re-grouping when FileBrowser remounts on tab switch.
    if (files === get().lastGroupedFiles) return
    set({ isGrouping: true, progress: 0, hashResults: new Map(), groups: [], ungrouped: [], lastGroupedFiles: files })
    const results = new Map<string, ChainHashResult>()
    const BATCH = 10

    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH)
      await Promise.all(batch.map(async (f) => {
        try {
          // Check cache first
          const cached = await dbGet(f.path, f.mtime)
          if (cached) { results.set(f.path, cached); return }

          const content = await readFile(f.path)
          const chains = parseChainSequences(content)
          const chainHashes: Record<string, string> = {}
          for (const [chainId, data] of chains) {
            chainHashes[chainId] = await hashSeq(data.sequence)
          }
          const r: ChainHashResult = { path: f.path, mtime: f.mtime, chainHashes }
          results.set(f.path, r)
          await dbPut(r)
        } catch { /* skip on error */ }
      }))

      const { groups, ungrouped } = computeGroups(results)
      set({ hashResults: new Map(results), groups, ungrouped, progress: (i + BATCH) / files.length })

      // Yield to UI thread
      await new Promise(r => setTimeout(r, 0))
    }

    set({ isGrouping: false, progress: 1, lastGroupedFiles: files })
  },
    }),
    {
      name: 'dc-group-prefs',
      partialize: (s) => ({ viewMode: s.viewMode }),
    },
  ),
)
