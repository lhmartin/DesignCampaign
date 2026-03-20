import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useNamedSelectionStore } from '@/stores/named-selection-store'
import type { EpitopeHit } from '@/stores/named-selection-store'

// ── Mock dynamic imports used inside runSearch ────────────────────────────────

const { mockSearch, mockBatchInject } = vi.hoisted(() => ({
  mockSearch:      vi.fn(),
  mockBatchInject: vi.fn(),
}))

vi.mock('@/lib/epitope-search', () => ({ searchEpitopeContacts: mockSearch }))
vi.mock('@/stores/metrics-store', () => ({
  useMetricsStore: { getState: () => ({ batchInjectResults: mockBatchInject }) },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_PARAMS = { cutoff: 5.0, atomScope: 'all-heavy' as const, matchMode: 'any' as const, matchValue: 1 }

function store() { return useNamedSelectionStore.getState() }

beforeEach(() => {
  useNamedSelectionStore.setState({
    selections: [], searchState: {}, openSearchId: null, searchParams: DEFAULT_PARAMS,
  })
  mockSearch.mockReset()
  mockBatchInject.mockReset()
})

// ── save ──────────────────────────────────────────────────────────────────────

describe('save', () => {
  it('appends a new selection with the correct fields', () => {
    store().save('Epitope A', ['A:1', 'A:2'], 'A', 'hash123')
    const [sel] = store().selections
    expect(sel.name).toBe('Epitope A')
    expect(sel.residues).toEqual(['A:1', 'A:2'])
    expect(sel.chainId).toBe('A')
    expect(sel.chainHash).toBe('hash123')
    expect(sel.visible).toBe(true)
    expect(typeof sel.id).toBe('string')
  })

  it('trims the name and defaults to "Unnamed" for whitespace-only input', () => {
    store().save('   ', ['A:1'], 'A', 'h')
    expect(store().selections[0].name).toBe('Unnamed')
  })

  it('assigns palette colors that cycle every 6 entries', () => {
    for (let i = 0; i < 7; i++) store().save(`s${i}`, ['A:1'], 'A', 'h')
    const colors = store().selections.map(s => s.color)
    // 7th selection wraps to the first palette color
    expect(colors[6]).toBe(colors[0])
    // consecutive selections get different colors
    expect(colors[0]).not.toBe(colors[1])
  })

  it('multiple saves each get a unique id', () => {
    store().save('X', ['A:1'], 'A', 'h1')
    store().save('Y', ['A:2'], 'A', 'h2')
    const [a, b] = store().selections
    expect(a.id).not.toBe(b.id)
  })
})

// ── rename ────────────────────────────────────────────────────────────────────

describe('rename', () => {
  it('updates the name of the matching selection', () => {
    store().save('Old', ['A:1'], 'A', 'h')
    const { id } = store().selections[0]
    store().rename(id, 'New')
    expect(store().selections[0].name).toBe('New')
  })

  it('does not update when the new name is blank', () => {
    store().save('Keep', ['A:1'], 'A', 'h')
    const { id } = store().selections[0]
    store().rename(id, '   ')
    expect(store().selections[0].name).toBe('Keep')
  })

  it('does not affect other selections', () => {
    store().save('A', ['A:1'], 'A', 'h1')
    store().save('B', ['B:1'], 'B', 'h2')
    const [idA] = store().selections.map(s => s.id)
    store().rename(idA, 'A-renamed')
    expect(store().selections[1].name).toBe('B')
  })
})

// ── remove ────────────────────────────────────────────────────────────────────

describe('remove', () => {
  it('removes the selection from the list', () => {
    store().save('A', ['A:1'], 'A', 'h')
    const { id } = store().selections[0]
    store().remove(id)
    expect(store().selections).toHaveLength(0)
  })

  it('clears the associated searchState entry', () => {
    store().save('A', ['A:1'], 'A', 'h')
    const { id } = store().selections[0]
    useNamedSelectionStore.setState({
      searchState: { [id]: { running: false, results: [], error: null, progress: 1, total: 1 } },
    })
    store().remove(id)
    expect(store().searchState[id]).toBeUndefined()
  })

  it('resets openSearchId when the removed selection was open', () => {
    store().save('A', ['A:1'], 'A', 'h')
    const { id } = store().selections[0]
    store().openSearch(id)
    store().remove(id)
    expect(store().openSearchId).toBeNull()
  })

  it('leaves openSearchId intact when a different selection is removed', () => {
    store().save('A', ['A:1'], 'A', 'h1')
    store().save('B', ['B:1'], 'B', 'h2')
    const [idA, idB] = store().selections.map(s => s.id)
    store().openSearch(idB)
    store().remove(idA)
    expect(store().openSearchId).toBe(idB)
  })
})

// ── toggleVisible ─────────────────────────────────────────────────────────────

describe('toggleVisible', () => {
  it('flips visible true → false', () => {
    store().save('A', ['A:1'], 'A', 'h')
    const { id } = store().selections[0]
    store().toggleVisible(id)
    expect(store().selections[0].visible).toBe(false)
  })

  it('flips visible false → true', () => {
    store().save('A', ['A:1'], 'A', 'h')
    const { id } = store().selections[0]
    store().toggleVisible(id) // → false
    store().toggleVisible(id) // → true
    expect(store().selections[0].visible).toBe(true)
  })
})

// ── setSearchParams ───────────────────────────────────────────────────────────

describe('setSearchParams', () => {
  it('merges a partial update, leaving unspecified fields unchanged', () => {
    store().setSearchParams({ cutoff: 8.0 })
    expect(store().searchParams.cutoff).toBe(8.0)
    expect(store().searchParams.atomScope).toBe('all-heavy')
  })

  it('can update matchMode and matchValue together', () => {
    store().setSearchParams({ matchMode: 'percentage', matchValue: 75 })
    expect(store().searchParams.matchMode).toBe('percentage')
    expect(store().searchParams.matchValue).toBe(75)
  })
})

// ── openSearch / clearResults ─────────────────────────────────────────────────

describe('openSearch', () => {
  it('sets openSearchId to the given id', () => {
    store().openSearch('abc')
    expect(store().openSearchId).toBe('abc')
  })

  it('clears openSearchId when called with null', () => {
    store().openSearch('abc')
    store().openSearch(null)
    expect(store().openSearchId).toBeNull()
  })
})

describe('clearResults', () => {
  it('deletes the searchState entry for the given id', () => {
    useNamedSelectionStore.setState({
      searchState: { sel1: { running: false, results: [], error: null, progress: 1, total: 1 } },
    })
    store().clearResults('sel1')
    expect(store().searchState['sel1']).toBeUndefined()
  })

  it('leaves other searchState entries intact', () => {
    useNamedSelectionStore.setState({
      searchState: {
        sel1: { running: false, results: [], error: null, progress: 1, total: 1 },
        sel2: { running: false, results: [], error: null, progress: 1, total: 1 },
      },
    })
    store().clearResults('sel1')
    expect(store().searchState['sel2']).toBeDefined()
  })
})

// ── runSearch ─────────────────────────────────────────────────────────────────

describe('runSearch', () => {
  const MOCK_HITS: EpitopeHit[] = [
    { filePath: '/a.pdb', name: 'a.pdb', hitCount: 3, totalCount: 5, hitFraction: 0.6 },
    { filePath: '/b.pdb', name: 'b.pdb', hitCount: 5, totalCount: 5, hitFraction: 1.0 },
  ]

  const FILES = [{ name: 'a.pdb', filePath: '/a.pdb' }]
  const readFile = async () => ''

  beforeEach(() => {
    store().save('Epitope', ['A:1'], 'A', 'h')
    mockSearch.mockResolvedValue(MOCK_HITS)
  })

  it('resolves with running=false and no error on success', async () => {
    const { id } = store().selections[0]
    await store().runSearch(id, FILES, readFile)
    expect(store().searchState[id].running).toBe(false)
    expect(store().searchState[id].error).toBeNull()
  })

  it('sorts results by hitFraction descending', async () => {
    const { id } = store().selections[0]
    await store().runSearch(id, FILES, readFile)
    const { results } = store().searchState[id]
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].hitFraction).toBeGreaterThanOrEqual(results[i].hitFraction)
    }
  })

  it('calls batchInjectResults with a column named after the selection', async () => {
    const { id } = store().selections[0]
    await store().runSearch(id, FILES, readFile)
    expect(mockBatchInject).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ metrics: expect.objectContaining({ hits_Epitope: expect.any(Number) }) }),
      ]),
    )
  })

  it('sets error string and running=false on failure', async () => {
    mockSearch.mockRejectedValue(new Error('Search exploded'))
    const { id } = store().selections[0]
    await store().runSearch(id, FILES, readFile)
    const state = store().searchState[id]
    expect(state.running).toBe(false)
    expect(state.error).toBe('Search exploded')
  })

  it('does nothing when the selection id is not found', async () => {
    await store().runSearch('nonexistent', FILES, readFile)
    expect(mockSearch).not.toHaveBeenCalled()
  })

  it('stores progress updates during search', async () => {
    const { id } = store().selections[0]
    // Simulate progress via the onProgress callback
    mockSearch.mockImplementation(async (_sel, _params, _files, _read, onProgress) => {
      onProgress?.(1, 2)
      return MOCK_HITS
    })
    await store().runSearch(id, FILES, readFile)
    // After completion progress should be 1
    expect(store().searchState[id].progress).toBe(1)
  })
})
