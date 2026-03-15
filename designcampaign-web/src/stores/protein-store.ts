import { create } from 'zustand'
import type { ProteinData } from '@/types/protein'

interface ProteinStore {
  currentProtein: ProteinData | null
  loadedProteins: Map<string, ProteinData>
  isLoading: boolean
  loadError: string | null

  setCurrentProtein: (protein: ProteinData | null) => void
  setLoading: (loading: boolean, error?: string | null) => void
  cacheProtein: (filePath: string, protein: ProteinData) => void
  getCachedProtein: (filePath: string) => ProteinData | undefined
}

export const useProteinStore = create<ProteinStore>((set, get) => ({
  currentProtein: null,
  loadedProteins: new Map(),
  isLoading: false,
  loadError: null,

  setCurrentProtein: (protein: ProteinData | null) => {
    set({ currentProtein: protein, loadError: null })
  },

  setLoading: (loading: boolean, error: string | null = null) => {
    set({ isLoading: loading, loadError: error })
  },

  cacheProtein: (filePath: string, protein: ProteinData) => {
    const map = new Map(get().loadedProteins)
    map.set(filePath, protein)
    set({ loadedProteins: map })
  },

  getCachedProtein: (filePath: string): ProteinData | undefined => {
    return get().loadedProteins.get(filePath)
  },
}))
