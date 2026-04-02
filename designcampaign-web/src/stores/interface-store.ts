import { create } from 'zustand'
import type { SelectionKey } from '@/types/selection'
import { APP_DEFAULTS } from '@/lib/constants/app'
import { type ResidueProps, ZERO_RESIDUE_PROPS } from '@/lib/residue-props'

export type AtomScope = 'ca' | 'all-heavy' | 'backbone'

interface InterfaceStore {
  // ── Params ──────────────────────────────────────────────────────────────────
  binderChains: string[]
  targetChains: string[]
  cutoff: number           // Å
  atomScope: AtomScope

  // ── Results ─────────────────────────────────────────────────────────────────
  paratope:      Set<SelectionKey>   // binder-side contact residues
  epitope:       Set<SelectionKey>   // target-side contact residues
  nHBonds:       number
  nClashes:      number
  paratopeProps: ResidueProps
  epitopeProps:  ResidueProps
  isCalculating: boolean
  lastError: string | null

  // ── Actions ─────────────────────────────────────────────────────────────────
  setChains:      (binder: string[], target: string[]) => void
  setCutoff:      (v: number) => void
  setAtomScope:   (s: AtomScope) => void
  setResults:     (
    paratope: Set<SelectionKey>,
    epitope: Set<SelectionKey>,
    nHBonds: number,
    nClashes: number,
    paratopeProps: ResidueProps,
    epitopeProps: ResidueProps,
  ) => void
  setCalculating: (v: boolean) => void
  setError:       (e: string | null) => void
  clear:          () => void
}

// Hydrate the interface store from a batch result entry.
// Pass null/undefined to clear (e.g. when switching to a file with no results).
export function hydrateInterfaceFromBatch(
  entry: { paratope: string[]; epitope: string[]; nHBonds: number; nClashes: number; paratopeProps: ResidueProps; epitopeProps: ResidueProps } | null | undefined
): void {
  if (entry) {
    useInterfaceStore.getState().setResults(
      new Set(entry.paratope), new Set(entry.epitope),
      entry.nHBonds, entry.nClashes,
      entry.paratopeProps, entry.epitopeProps,
    )
  } else {
    useInterfaceStore.getState().clear()
  }
}

export const useInterfaceStore = create<InterfaceStore>((set) => ({
  binderChains:   [],
  targetChains:   [],
  cutoff:         APP_DEFAULTS.DEFAULT_INTERFACE_CUTOFF,
  atomScope:      'all-heavy',
  paratope:       new Set(),
  epitope:        new Set(),
  nHBonds:        0,
  nClashes:       0,
  paratopeProps:  ZERO_RESIDUE_PROPS,
  epitopeProps:   ZERO_RESIDUE_PROPS,
  isCalculating:  false,
  lastError:      null,

  setChains:      (binder, target) => set({ binderChains: binder, targetChains: target }),
  setCutoff:      (v)  => set({ cutoff: v }),
  setAtomScope:   (s)  => set({ atomScope: s }),
  setResults:     (paratope, epitope, nHBonds, nClashes, paratopeProps, epitopeProps) =>
    set({ paratope, epitope, nHBonds, nClashes, paratopeProps, epitopeProps, lastError: null }),
  setCalculating: (v)  => set({ isCalculating: v }),
  setError:       (e)  => set({ lastError: e, isCalculating: false }),
  clear: () => set({
    paratope: new Set(), epitope: new Set(),
    nHBonds: 0, nClashes: 0,
    paratopeProps: ZERO_RESIDUE_PROPS, epitopeProps: ZERO_RESIDUE_PROPS,
    lastError: null, isCalculating: false,
  }),
}))
