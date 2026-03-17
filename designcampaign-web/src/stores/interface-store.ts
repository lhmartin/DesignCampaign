import { create } from 'zustand'
import type { SelectionKey } from '@/types/selection'
import { APP_DEFAULTS } from '@/lib/constants/app'

export type AtomScope = 'all-heavy' | 'backbone'

interface InterfaceStore {
  // ── Params ──────────────────────────────────────────────────────────────────
  binderChains: string[]
  targetChains: string[]
  cutoff: number           // Å
  atomScope: AtomScope

  // ── Results ─────────────────────────────────────────────────────────────────
  paratope: Set<SelectionKey>   // binder-side contact residues
  epitope:  Set<SelectionKey>   // target-side contact residues
  isCalculating: boolean
  lastError: string | null

  // ── Actions ─────────────────────────────────────────────────────────────────
  setChains:      (binder: string[], target: string[]) => void
  setCutoff:      (v: number) => void
  setAtomScope:   (s: AtomScope) => void
  setResults:     (paratope: Set<SelectionKey>, epitope: Set<SelectionKey>) => void
  setCalculating: (v: boolean) => void
  setError:       (e: string | null) => void
  clear:          () => void
}

export const useInterfaceStore = create<InterfaceStore>((set) => ({
  binderChains:   [],
  targetChains:   [],
  cutoff:         APP_DEFAULTS.DEFAULT_INTERFACE_CUTOFF,
  atomScope:      'all-heavy',
  paratope:       new Set(),
  epitope:        new Set(),
  isCalculating:  false,
  lastError:      null,

  setChains:      (binder, target) => set({ binderChains: binder, targetChains: target }),
  setCutoff:      (v)  => set({ cutoff: v }),
  setAtomScope:   (s)  => set({ atomScope: s }),
  setResults:     (paratope, epitope) => set({ paratope, epitope, lastError: null }),
  setCalculating: (v)  => set({ isCalculating: v }),
  setError:       (e)  => set({ lastError: e, isCalculating: false }),
  clear:          ()   => set({ paratope: new Set(), epitope: new Set(), lastError: null, isCalculating: false }),
}))
