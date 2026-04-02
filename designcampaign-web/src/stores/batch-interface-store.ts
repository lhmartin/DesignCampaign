import { create } from 'zustand'
import type { ResidueProps } from '@/lib/residue-props'

export type ResidueKey = string   // "A:45" format

interface BatchInterfaceResult {
  paratope:      ResidueKey[]
  epitope:       ResidueKey[]
  nHBonds:       number
  nClashes:      number
  paratopeProps: ResidueProps
  epitopeProps:  ResidueProps
}

interface BatchInterfaceStore {
  // filePath → interface results
  results: Record<string, BatchInterfaceResult>
  setBatchResults: (data: Record<string, BatchInterfaceResult>) => void
  clear: () => void
}

export const useBatchInterfaceStore = create<BatchInterfaceStore>((set) => ({
  results: {},
  setBatchResults: (results) => set({ results }),
  clear: () => set({ results: {} }),
}))

/** Extract sorted unique residue numbers from SelectionKey list (strips chain prefix). */
export function residueNumbersFromKeys(keys: ResidueKey[]): number[] {
  const nums = new Set<number>()
  for (const key of keys) {
    const sep = key.lastIndexOf(':')
    if (sep < 0) continue                       // skip keys without a chain prefix
    const n = parseInt(key.slice(sep + 1), 10)
    if (!isNaN(n)) nums.add(n)
  }
  return Array.from(nums).sort((a, b) => a - b)
}
