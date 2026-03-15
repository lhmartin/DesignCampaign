import { create } from 'zustand'

export const COMPARISON_COLORS = [
  0xff7f0e, // orange
  0x2ca02c, // green
  0x9467bd, // purple
  0xd62728, // red
  0x8c564b, // brown
  0xe377c2, // pink
]

export interface ComparisonEntry {
  id: string
  name: string
  filePath: string
  color: number
  visible: boolean
  rmsd: number | null
  /** Mol* state-tree ref of the loaded rawData node — used for removal */
  dataRef: string | null
}

interface ComparisonState {
  entries: ComparisonEntry[]
  addEntry: (entry: ComparisonEntry) => void
  removeEntry: (id: string) => void
  updateEntry: (id: string, patch: Partial<ComparisonEntry>) => void
  clearAll: () => void
  nextColor: () => number
}

export const useComparisonStore = create<ComparisonState>((set, get) => ({
  entries: [],
  addEntry: (entry) => set((s) => ({ entries: [...s.entries, entry] })),
  removeEntry: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
  updateEntry: (id, patch) =>
    set((s) => ({
      entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    })),
  clearAll: () => set({ entries: [] }),
  nextColor: () => {
    const used = get().entries.length
    return COMPARISON_COLORS[used % COMPARISON_COLORS.length]
  },
}))
