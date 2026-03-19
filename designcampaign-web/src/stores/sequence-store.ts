import { create } from 'zustand'

export interface ChainSeq {
  chain: string
  seq: string
}

interface SequenceStore {
  /** Sequences for all loaded structures, keyed by display name (matches ProteinMetrics.name). */
  sequences: Map<string, ChainSeq[]>
  setSequences: (name: string, chains: ChainSeq[]) => void
  clearAll: () => void
}

export const useSequenceStore = create<SequenceStore>((set) => ({
  sequences: new Map(),

  setSequences: (name, chains) =>
    set(s => {
      const next = new Map(s.sequences)
      next.set(name, chains)
      return { sequences: next }
    }),

  clearAll: () => set({ sequences: new Map() }),
}))
