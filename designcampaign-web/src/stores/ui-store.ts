import { create } from 'zustand'

interface UIStore {
  activeTab: string
  setActiveTab: (tab: string) => void
}

export const useUIStore = create<UIStore>((set) => ({
  activeTab: 'files',
  setActiveTab: (tab) => set({ activeTab: tab }),
}))
