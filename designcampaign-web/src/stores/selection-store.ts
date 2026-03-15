import { create } from 'zustand'

export type SelectionKey = string  // "chainId:resId"

interface SelectionStore {
  selectedResidues: Set<SelectionKey>
  addResidue(chainId: string, resId: number): void
  toggleResidue(chainId: string, resId: number): void
  clearSelection(): void
  selectAll(keys: SelectionKey[]): void
  invertSelection(all: SelectionKey[]): void
}

export const useSelectionStore = create<SelectionStore>((set, get) => ({
  selectedResidues: new Set(),

  addResidue(chainId, resId) {
    const key = `${chainId}:${resId}`
    set(s => ({ selectedResidues: new Set([...s.selectedResidues, key]) }))
  },

  toggleResidue(chainId, resId) {
    const key = `${chainId}:${resId}`
    set(s => {
      const next = new Set(s.selectedResidues)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return { selectedResidues: next }
    })
  },

  clearSelection() {
    set({ selectedResidues: new Set() })
  },

  selectAll(keys) {
    set({ selectedResidues: new Set(keys) })
  },

  invertSelection(all) {
    const current = get().selectedResidues
    set({ selectedResidues: new Set(all.filter(k => !current.has(k))) })
  },
}))
