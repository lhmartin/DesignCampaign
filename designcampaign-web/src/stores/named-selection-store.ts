import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SelectionKey } from '@/stores/selection-store'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NamedSelection {
  id:        string
  name:      string
  residues:  SelectionKey[]   // "chain:resId" keys
  chainId:   string           // e.g. "B"
  chainHash: string           // 12-char hex from hashSeq
  color:     number           // hex color as integer
  visible:   boolean
}

export interface EpitopeSearchParams {
  cutoff:     number                            // Å, default 5.0
  atomScope:  'ca' | 'all-heavy' | 'backbone'
  matchMode:  'any' | 'all' | 'count' | 'percentage'
  matchValue: number                            // for count: min; for percentage: 0-100
}

export interface EpitopeHit {
  filePath:    string
  name:        string
  hitCount:    number
  totalCount:  number
  hitFraction: number
}

interface SearchState {
  running:  boolean
  results:  EpitopeHit[]
  error:    string | null
  progress: number   // 0-1
  total:    number
}

interface NamedSelectionStore {
  selections:   NamedSelection[]
  searchState:  Record<string, SearchState>
  searchParams: EpitopeSearchParams
  // which selection has the search panel open
  openSearchId: string | null

  save(name: string, residues: SelectionKey[], chainId: string, chainHash: string): void
  rename(id: string, name: string): void
  remove(id: string): void
  toggleVisible(id: string): void
  setSearchParams(p: Partial<EpitopeSearchParams>): void
  openSearch(id: string | null): void
  runSearch(
    id: string,
    files: { name: string; filePath: string }[],
    readFile: (p: string) => Promise<string>,
  ): Promise<void>
  clearResults(id: string): void
}

// ── Color palette ─────────────────────────────────────────────────────────────

const PALETTE = [0x22c55e, 0xf97316, 0x8b5cf6, 0xec4899, 0x06b6d4, 0xeab308]
/** Pick next palette color based on how many selections already exist, so color
 *  assignment is deterministic and survives localStorage reload. */
function nextColor(existingCount: number): number {
  return PALETTE[existingCount % PALETTE.length]
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useNamedSelectionStore = create<NamedSelectionStore>()(
  persist(
    (set, get) => ({
      selections:   [],
      searchState:  {},
      searchParams: { cutoff: 5.0, atomScope: 'all-heavy', matchMode: 'any', matchValue: 1 },
      openSearchId: null,

      save(name, residues, chainId, chainHash) {
        const id = crypto.randomUUID()
        set(s => ({
          selections: [
            ...s.selections,
            { id, name: name.trim() || 'Unnamed', residues, chainId, chainHash, color: nextColor(s.selections.length), visible: true },
          ],
        }))
      },

      rename(id, name) {
        const trimmed = name.trim()
        if (!trimmed) return
        set(s => ({
          selections: s.selections.map(sel => sel.id === id ? { ...sel, name: trimmed } : sel),
        }))
      },

      remove(id) {
        set(s => {
          const next = { ...s.searchState }
          delete next[id]
          return {
            selections: s.selections.filter(sel => sel.id !== id),
            searchState: next,
            openSearchId: s.openSearchId === id ? null : s.openSearchId,
          }
        })
      },

      toggleVisible(id) {
        set(s => ({
          selections: s.selections.map(sel => sel.id === id ? { ...sel, visible: !sel.visible } : sel),
        }))
      },

      setSearchParams(p) {
        set(s => ({ searchParams: { ...s.searchParams, ...p } }))
      },

      openSearch(id) {
        set({ openSearchId: id })
      },

      clearResults(id) {
        set(s => {
          const next = { ...s.searchState }
          delete next[id]
          return { searchState: next }
        })
      },

      async runSearch(id, files, readFile) {
        const { selections, searchParams } = get()
        const selection = selections.find(s => s.id === id)
        if (!selection) return

        set(s => ({
          searchState: {
            ...s.searchState,
            [id]: { running: true, results: [], error: null, progress: 0, total: files.length },
          },
        }))

        try {
          const { searchEpitopeContacts } = await import('@/lib/epitope-search')
          // Throttle progress updates: fire only every 5% or on the final file
          // to avoid 1 store update (and React re-render) per file for large batches.
          const STEP = Math.max(1, Math.ceil(files.length * 0.05))
          const results = await searchEpitopeContacts(
            selection,
            searchParams,
            files,
            readFile,
            (done, total) => {
              if (done % STEP !== 0 && done !== total) return
              set(s => ({
                searchState: {
                  ...s.searchState,
                  [id]: { ...s.searchState[id], progress: done / total, total },
                },
              }))
            },
          )

          // Sort by hitFraction desc
          results.sort((a, b) => b.hitFraction - a.hitFraction)

          // Inject into metrics table
          const { useMetricsStore } = await import('@/stores/metrics-store')
          const sanitisedName = selection.name.replace(/[^a-zA-Z0-9]/g, '_')
          const colName = `hits_${sanitisedName}`
          useMetricsStore.getState().batchInjectResults(
            results.map(r => ({ filePath: r.filePath, name: r.name, metrics: { [colName]: r.hitCount } })),
          )

          set(s => ({
            searchState: {
              ...s.searchState,
              [id]: { running: false, results, error: null, progress: 1, total: files.length },
            },
          }))
        } catch (err) {
          set(s => ({
            searchState: {
              ...s.searchState,
              [id]: {
                ...s.searchState[id],
                running: false,
                error: err instanceof Error ? err.message : 'Search failed',
              },
            },
          }))
        }
      },
    }),
    {
      name: 'named-selections',
      partialize: (s) => ({ selections: s.selections, searchParams: s.searchParams }),
    },
  ),
)
