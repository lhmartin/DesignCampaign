import { create } from 'zustand'

export type ResidueKey = string   // "A:45" format

interface BatchInterfaceStore {
  // filePath → { paratope: ResidueKey[], epitope: ResidueKey[] }
  results: Record<string, { paratope: ResidueKey[]; epitope: ResidueKey[] }>
  setBatchResults: (data: Record<string, { paratope: ResidueKey[]; epitope: ResidueKey[] }>) => void
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
