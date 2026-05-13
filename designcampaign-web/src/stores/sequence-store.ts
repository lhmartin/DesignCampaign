import { create } from 'zustand'

export interface ChainSeq {
  chain: string
  seq: string
}

interface SequenceStore {
  /** Sequences for all loaded structures, keyed by file path (matches ProteinMetrics.filePath). */
  sequencesByPath: Map<string, ChainSeq[]>
  setSequences: (filePath: string, chains: ChainSeq[]) => void
  /** Merge a batch of sequences in a single store update — O(N) vs O(N²) for N entries. */
  mergeSequences: (batch: Map<string, ChainSeq[]>) => void
  clearAll: () => void
}

export const useSequenceStore = create<SequenceStore>((set) => ({
  sequencesByPath: new Map(),

  setSequences: (filePath, chains) =>
    set(s => {
      const next = new Map(s.sequencesByPath)
      next.set(filePath, chains)
      return { sequencesByPath: next }
    }),

  mergeSequences: (batch) =>
    set(s => {
      const next = new Map(s.sequencesByPath)
      for (const [filePath, chains] of batch) next.set(filePath, chains)
      return { sequencesByPath: next }
    }),

  clearAll: () => set({ sequencesByPath: new Map() }),
}))
