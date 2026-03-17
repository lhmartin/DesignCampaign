import { describe, it, expect, beforeEach } from 'vitest'
import { useSelectionStore } from '@/stores/selection-store'

beforeEach(() => {
  useSelectionStore.getState().clearSelection()
})

describe('addResidue', () => {
  it('adds a residue key to the selection', () => {
    useSelectionStore.getState().addResidue('A', 42)
    expect(useSelectionStore.getState().selectedResidues.has('A:42')).toBe(true)
  })

  it('is idempotent — adding the same residue twice has no effect', () => {
    useSelectionStore.getState().addResidue('A', 42)
    useSelectionStore.getState().addResidue('A', 42)
    expect(useSelectionStore.getState().selectedResidues.size).toBe(1)
  })

  it('key format is "chainId:resId"', () => {
    useSelectionStore.getState().addResidue('H', 99)
    expect(useSelectionStore.getState().selectedResidues.has('H:99')).toBe(true)
  })
})

describe('toggleResidue', () => {
  it('adds a residue that is not currently selected', () => {
    useSelectionStore.getState().toggleResidue('A', 10)
    expect(useSelectionStore.getState().selectedResidues.has('A:10')).toBe(true)
  })

  it('removes a residue that is currently selected', () => {
    useSelectionStore.getState().addResidue('A', 10)
    useSelectionStore.getState().toggleResidue('A', 10)
    expect(useSelectionStore.getState().selectedResidues.has('A:10')).toBe(false)
  })

  it('does not affect other selected residues when toggling', () => {
    useSelectionStore.getState().addResidue('A', 10)
    useSelectionStore.getState().addResidue('A', 11)
    useSelectionStore.getState().toggleResidue('A', 10)
    expect(useSelectionStore.getState().selectedResidues.has('A:11')).toBe(true)
  })
})

describe('clearSelection', () => {
  it('empties the selection', () => {
    useSelectionStore.getState().addResidue('A', 1)
    useSelectionStore.getState().addResidue('A', 2)
    useSelectionStore.getState().clearSelection()
    expect(useSelectionStore.getState().selectedResidues.size).toBe(0)
  })
})

describe('selectAll', () => {
  it('replaces selection with the provided keys', () => {
    useSelectionStore.getState().addResidue('A', 1)
    useSelectionStore.getState().selectAll(['B:10', 'B:11', 'B:12'])
    const sel = useSelectionStore.getState().selectedResidues
    expect(sel.has('A:1')).toBe(false)
    expect(sel.has('B:10')).toBe(true)
    expect(sel.has('B:11')).toBe(true)
    expect(sel.size).toBe(3)
  })

  it('calling selectAll with empty array clears the selection', () => {
    useSelectionStore.getState().addResidue('A', 1)
    useSelectionStore.getState().selectAll([])
    expect(useSelectionStore.getState().selectedResidues.size).toBe(0)
  })
})

describe('invertSelection', () => {
  it('selects all unselected keys and deselects all selected keys', () => {
    const all = ['A:1', 'A:2', 'A:3', 'A:4']
    useSelectionStore.getState().selectAll(['A:1', 'A:2'])
    useSelectionStore.getState().invertSelection(all)
    const sel = useSelectionStore.getState().selectedResidues
    expect(sel.has('A:1')).toBe(false)
    expect(sel.has('A:2')).toBe(false)
    expect(sel.has('A:3')).toBe(true)
    expect(sel.has('A:4')).toBe(true)
  })

  it('inverts to the full set when nothing is selected', () => {
    const all = ['A:1', 'A:2', 'A:3']
    useSelectionStore.getState().invertSelection(all)
    expect(useSelectionStore.getState().selectedResidues.size).toBe(3)
  })

  it('clears to empty when everything is selected', () => {
    const all = ['A:1', 'A:2']
    useSelectionStore.getState().selectAll(all)
    useSelectionStore.getState().invertSelection(all)
    expect(useSelectionStore.getState().selectedResidues.size).toBe(0)
  })
})
