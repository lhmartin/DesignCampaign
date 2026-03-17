import { describe, it, expect, beforeEach } from 'vitest'
import { useBatchInterfaceStore, residueNumbersFromKeys } from '@/stores/batch-interface-store'

beforeEach(() => {
  useBatchInterfaceStore.getState().clear()
})

describe('residueNumbersFromKeys', () => {
  it('extracts residue numbers and sorts them ascending', () => {
    expect(residueNumbersFromKeys(['A:42', 'B:99', 'A:10'])).toEqual([10, 42, 99])
  })

  it('deduplicates residue numbers from different chains', () => {
    // A:42 and B:42 both have resId 42 — should appear once
    expect(residueNumbersFromKeys(['A:42', 'B:42'])).toEqual([42])
  })

  it('returns empty array for empty input', () => {
    expect(residueNumbersFromKeys([])).toEqual([])
  })

  it('skips keys without a colon separator', () => {
    expect(residueNumbersFromKeys(['42', 'A:99'])).toEqual([99])
  })

  it('handles large residue numbers', () => {
    expect(residueNumbersFromKeys(['A:1000', 'B:2000'])).toEqual([1000, 2000])
  })

  it('skips keys where the residue portion is not a number', () => {
    expect(residueNumbersFromKeys(['A:abc', 'B:10'])).toEqual([10])
  })
})

describe('useBatchInterfaceStore', () => {
  it('starts with empty results', () => {
    expect(Object.keys(useBatchInterfaceStore.getState().results)).toHaveLength(0)
  })

  it('setBatchResults stores the provided data', () => {
    useBatchInterfaceStore.getState().setBatchResults({
      '/path/a.pdb': { paratope: ['A:10', 'A:11'], epitope: ['B:50'] },
    })
    const results = useBatchInterfaceStore.getState().results
    expect(results['/path/a.pdb'].paratope).toContain('A:10')
    expect(results['/path/a.pdb'].epitope).toContain('B:50')
  })

  it('setBatchResults replaces previous data entirely', () => {
    useBatchInterfaceStore.getState().setBatchResults({ '/old.pdb': { paratope: [], epitope: [] } })
    useBatchInterfaceStore.getState().setBatchResults({ '/new.pdb': { paratope: ['A:1'], epitope: [] } })
    const results = useBatchInterfaceStore.getState().results
    expect(results['/old.pdb']).toBeUndefined()
    expect(results['/new.pdb']).toBeDefined()
  })

  it('clear() empties all results', () => {
    useBatchInterfaceStore.getState().setBatchResults({ '/a.pdb': { paratope: ['A:1'], epitope: [] } })
    useBatchInterfaceStore.getState().clear()
    expect(Object.keys(useBatchInterfaceStore.getState().results)).toHaveLength(0)
  })
})
