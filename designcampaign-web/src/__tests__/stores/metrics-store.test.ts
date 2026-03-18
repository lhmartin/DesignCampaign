import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useMetricsStore } from '@/stores/metrics-store'
import { makePdbLine } from '../fixtures/pdb-fragments'

beforeEach(() => {
  useMetricsStore.getState().clearAll()
})

// ─── addRow / upsert ──────────────────────────────────────────────────────────

describe('addRow', () => {
  it('adds a row to the store', () => {
    useMetricsStore.getState().addRow({ name: 'p1', filePath: '/p1.pdb', metrics: { mean_plddt: 75 } })
    expect(useMetricsStore.getState().rows).toHaveLength(1)
  })

  it('merges metrics when the same filePath is added twice', () => {
    useMetricsStore.getState().addRow({ name: 'p1', filePath: '/p1.pdb', metrics: { mean_plddt: 75 } })
    useMetricsStore.getState().addRow({ name: 'p1', filePath: '/p1.pdb', metrics: { chain_count: 2 } })
    const rows = useMetricsStore.getState().rows
    expect(rows).toHaveLength(1)
    expect(rows[0].metrics.mean_plddt).toBe(75)
    expect(rows[0].metrics.chain_count).toBe(2)
  })

  it('does not duplicate rows with same name but different filePath', () => {
    useMetricsStore.getState().addRow({ name: 'p1', filePath: '/a.pdb', metrics: {} })
    useMetricsStore.getState().addRow({ name: 'p1', filePath: '/b.pdb', metrics: {} })
    // filePath /b.pdb is different → new row (no match by filePath, no match by name for /b)
    // Actually name match will find p1 and merge. Let's verify the actual behavior.
    // /b.pdb → filePath not found → fall back to name 'p1' → merge
    expect(useMetricsStore.getState().rows).toHaveLength(1)
  })

  it('adds new columns to allColumns', () => {
    useMetricsStore.getState().addRow({ name: 'p1', filePath: null, metrics: { custom_metric: 1 } })
    expect(useMetricsStore.getState().allColumns).toContain('custom_metric')
  })
})

// ─── renameRow ────────────────────────────────────────────────────────────────

describe('renameRow', () => {
  it('renames a row by old name', () => {
    useMetricsStore.getState().addRow({ name: 'old', filePath: null, metrics: {} })
    useMetricsStore.getState().renameRow('old', 'new')
    expect(useMetricsStore.getState().rows[0].name).toBe('new')
  })

  it('is a no-op when new name already exists', () => {
    useMetricsStore.getState().addRow({ name: 'a', filePath: '/a.pdb', metrics: {} })
    useMetricsStore.getState().addRow({ name: 'b', filePath: '/b.pdb', metrics: {} })
    useMetricsStore.getState().renameRow('a', 'b')
    expect(useMetricsStore.getState().rows.find(r => r.name === 'a')).toBeDefined()
  })

  it('trims whitespace from new name', () => {
    useMetricsStore.getState().addRow({ name: 'old', filePath: null, metrics: {} })
    useMetricsStore.getState().renameRow('old', '  trimmed  ')
    expect(useMetricsStore.getState().rows[0].name).toBe('trimmed')
  })

  it('is a no-op when old name not found', () => {
    useMetricsStore.getState().addRow({ name: 'exists', filePath: null, metrics: {} })
    useMetricsStore.getState().renameRow('ghost', 'new')
    expect(useMetricsStore.getState().rows[0].name).toBe('exists')
  })
})

// ─── injectColumn ─────────────────────────────────────────────────────────────

describe('injectColumn', () => {
  it('injects a column value for matching rows by name', () => {
    useMetricsStore.getState().addRow({ name: 'p1', filePath: null, metrics: { mean_plddt: 70 } })
    useMetricsStore.getState().addRow({ name: 'p2', filePath: null, metrics: { mean_plddt: 80 } })
    useMetricsStore.getState().injectColumn('rank_score', new Map([['p1', 0.5], ['p2', 0.9]]))
    const rows = useMetricsStore.getState().rows
    expect(rows.find(r => r.name === 'p1')?.metrics.rank_score).toBe(0.5)
    expect(rows.find(r => r.name === 'p2')?.metrics.rank_score).toBe(0.9)
  })

  it('does not affect rows not in the Map', () => {
    useMetricsStore.getState().addRow({ name: 'p1', filePath: null, metrics: {} })
    useMetricsStore.getState().addRow({ name: 'p2', filePath: null, metrics: {} })
    useMetricsStore.getState().injectColumn('rank_score', new Map([['p1', 1.0]]))
    const p2 = useMetricsStore.getState().rows.find(r => r.name === 'p2')
    expect(p2?.metrics.rank_score).toBeUndefined()
  })

  it('adds the column name to allColumns', () => {
    useMetricsStore.getState().injectColumn('custom', new Map())
    expect(useMetricsStore.getState().allColumns).toContain('custom')
  })
})

// ─── batchInjectResults ───────────────────────────────────────────────────────

describe('batchInjectResults', () => {
  it('matches by filePath and merges metrics', () => {
    useMetricsStore.getState().addRow({ name: 'p1', filePath: '/p1.pdb', metrics: { mean_plddt: 75 } })
    useMetricsStore.getState().batchInjectResults([
      { filePath: '/p1.pdb', name: 'p1', metrics: { n_paratope: 10, n_contacts: 50 } },
    ])
    const row = useMetricsStore.getState().rows[0]
    expect(row.metrics.mean_plddt).toBe(75)   // original preserved
    expect(row.metrics.n_paratope).toBe(10)   // injected
    expect(row.metrics.n_contacts).toBe(50)
  })

  it('falls back to name matching when no filePath match', () => {
    useMetricsStore.getState().addRow({ name: 'p2', filePath: null, metrics: { mean_plddt: 80 } })
    useMetricsStore.getState().batchInjectResults([
      { filePath: '/new.pdb', name: 'p2', metrics: { n_epitope: 8 } },
    ])
    const row = useMetricsStore.getState().rows[0]
    expect(row.metrics.n_epitope).toBe(8)
  })

  it('creates a new row for an unmatched filePath + name', () => {
    useMetricsStore.getState().batchInjectResults([
      { filePath: '/brand-new.pdb', name: 'new_protein', metrics: { n_paratope: 5 } },
    ])
    const rows = useMetricsStore.getState().rows
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('new_protein')
  })

  it('adds paratope_residues and epitope_residues to allColumns', () => {
    useMetricsStore.getState().batchInjectResults([
      { filePath: '/a.pdb', name: 'a', metrics: {} },
    ])
    expect(useMetricsStore.getState().allColumns).toContain('paratope_residues')
    expect(useMetricsStore.getState().allColumns).toContain('epitope_residues')
  })
})

// ─── getFilteredRows ──────────────────────────────────────────────────────────

describe('getFilteredRows', () => {
  beforeEach(() => {
    useMetricsStore.getState().addRow({ name: 'Alpha', filePath: '/a.pdb', metrics: { score: 80 } })
    useMetricsStore.getState().addRow({ name: 'Beta',  filePath: '/b.pdb', metrics: { score: 60 } })
    useMetricsStore.getState().addRow({ name: 'Gamma', filePath: '/g.pdb', metrics: { score: 70 } })
  })

  it('returns all rows when no filter applied', () => {
    expect(useMetricsStore.getState().getFilteredRows()).toHaveLength(3)
  })

  it('filters by name substring (case-insensitive)', () => {
    useMetricsStore.getState().setFilterText('alpha')
    expect(useMetricsStore.getState().getFilteredRows()).toHaveLength(1)
    expect(useMetricsStore.getState().getFilteredRows()[0].name).toBe('Alpha')
  })

  it('returns all when filterText does not match any row', () => {
    useMetricsStore.getState().setFilterText('zzz')
    expect(useMetricsStore.getState().getFilteredRows()).toHaveLength(0)
  })

  it('filters by column range (min bound)', () => {
    useMetricsStore.getState().setColumnRange('score', 65, null)
    const rows = useMetricsStore.getState().getFilteredRows()
    expect(rows.every(r => r.metrics.score >= 65)).toBe(true)
    expect(rows).toHaveLength(2)  // 80 and 70
  })

  it('filters by column range (max bound)', () => {
    useMetricsStore.getState().setColumnRange('score', null, 75)
    const rows = useMetricsStore.getState().getFilteredRows()
    expect(rows.every(r => r.metrics.score <= 75)).toBe(true)
    expect(rows).toHaveLength(2)  // 60 and 70
  })

  it('passes all rows when the column has no value for a row', () => {
    useMetricsStore.getState().setColumnRange('nonexistent', 0, 100)
    expect(useMetricsStore.getState().getFilteredRows()).toHaveLength(3)
  })
})

// ─── importCSV / exportCSV ────────────────────────────────────────────────────

describe('importCSV', () => {
  it('parses header and data rows', () => {
    useMetricsStore.getState().importCSV('name,mean_plddt,chain_count\np1,75.0,2\np2,80.0,3')
    const rows = useMetricsStore.getState().rows
    expect(rows).toHaveLength(2)
    expect(rows[0].metrics.mean_plddt).toBeCloseTo(75)
    expect(rows[0].metrics.chain_count).toBe(2)
  })

  it('merges new columns into allColumns', () => {
    useMetricsStore.getState().importCSV('name,custom_metric\np1,1.5')
    expect(useMetricsStore.getState().allColumns).toContain('custom_metric')
  })

  it('skips rows with empty name', () => {
    useMetricsStore.getState().importCSV('name,score\n,10\nvalid,20')
    expect(useMetricsStore.getState().rows).toHaveLength(1)
  })

  it('handles fewer than 2 lines gracefully (no-op)', () => {
    useMetricsStore.getState().importCSV('name,score')
    expect(useMetricsStore.getState().rows).toHaveLength(0)
  })
})

describe('exportCSV', () => {
  it('produces valid CSV that round-trips through importCSV', () => {
    useMetricsStore.getState().addRow({ name: 'p1', filePath: '/p1.pdb', metrics: { mean_plddt: 75.12 } })
    const csv = useMetricsStore.getState().exportCSV()
    useMetricsStore.getState().clearAll()
    useMetricsStore.getState().importCSV(csv)
    const rows = useMetricsStore.getState().rows
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('p1')
    expect(rows[0].metrics.mean_plddt).toBeCloseTo(75.12, 1)
  })
})

// ─── importJSON ───────────────────────────────────────────────────────────────

describe('importJSON', () => {
  it('format A: {proteins: [...]}', () => {
    const json = JSON.stringify({ proteins: [{ name: 'p1', metrics: { score: 90 } }] })
    useMetricsStore.getState().importJSON(json)
    expect(useMetricsStore.getState().rows[0].metrics.score).toBe(90)
  })

  it('format B: array of {name, metrics}', () => {
    const json = JSON.stringify([{ name: 'p1', metrics: { score: 85 } }])
    useMetricsStore.getState().importJSON(json)
    expect(useMetricsStore.getState().rows[0].name).toBe('p1')
  })

  it('format C: flat object with numeric values', () => {
    const json = JSON.stringify({ score: 88, plddt: 92.5, name: 'ignored' })
    useMetricsStore.getState().importJSON(json)
    expect(useMetricsStore.getState().rows).toHaveLength(1)
    expect(useMetricsStore.getState().rows[0].metrics.score).toBe(88)
  })

  it('handles invalid JSON gracefully (no-op)', () => {
    useMetricsStore.getState().importJSON('not-json')
    expect(useMetricsStore.getState().rows).toHaveLength(0)
  })
})

// ─── calculateAll (async) ─────────────────────────────────────────────────────

describe('calculateAll', () => {
  it('creates rows from PDB files via readFile callback', async () => {
    const pdb = [
      makePdbLine('CA', 'A', 1, 0, 0, 0, 75.0, 1),
      makePdbLine('CA', 'A', 2, 1, 0, 0, 80.0, 2),
    ].join('\n')

    const readFile = vi.fn().mockResolvedValue(pdb)
    const files = [
      { name: 'design1.pdb', path: '/d1.pdb', size: 100, mtime: 0 },
      { name: 'design2.pdb', path: '/d2.pdb', size: 100, mtime: 0 },
    ]

    await useMetricsStore.getState().calculateAll(files, readFile)

    const { rows, isCalculating, progress } = useMetricsStore.getState()
    expect(rows).toHaveLength(2)
    expect(rows[0].name).toBe('design1')
    expect(rows[0].metrics.num_residues).toBe(2)
    expect(isCalculating).toBe(false)
    expect(progress).toBe(1)
  })

  it('sets isCalculating to true during processing', async () => {
    let sawCalculating = false
    const readFile = vi.fn().mockImplementation(async () => {
      sawCalculating = useMetricsStore.getState().isCalculating
      return makePdbLine('CA', 'A', 1, 0, 0, 0)
    })

    await useMetricsStore.getState().calculateAll(
      [{ name: 'p.pdb', path: '/p.pdb', size: 1, mtime: 0 }],
      readFile,
    )

    expect(sawCalculating).toBe(true)
    expect(useMetricsStore.getState().isCalculating).toBe(false)
  })

  it('skips files that fail to read and continues with the rest', async () => {
    const readFile = vi.fn()
      .mockRejectedValueOnce(new Error('File not found'))
      .mockResolvedValueOnce(makePdbLine('CA', 'A', 1, 0, 0, 0, 75.0))

    const files = [
      { name: 'bad.pdb', path: '/bad.pdb', size: 0, mtime: 0 },
      { name: 'good.pdb', path: '/good.pdb', size: 100, mtime: 0 },
    ]

    await useMetricsStore.getState().calculateAll(files, readFile)

    // Only the good file produces a metrics row
    expect(useMetricsStore.getState().rows.find(r => r.name === 'good')).toBeDefined()
  })
})

// ─── exportFilteredCSV ────────────────────────────────────────────────────────

describe('exportFilteredCSV', () => {
  beforeEach(() => {
    useMetricsStore.getState().clearAll()
    // Restore default hiddenColumns since clearAll doesn't reset it
    useMetricsStore.getState().setHiddenColumns([])
    useMetricsStore.getState().setFilterText('')
  })

  it('exports all rows when no filter is active', () => {
    useMetricsStore.getState().addRow({ name: 'p1', filePath: null, metrics: { score: 0.9 } })
    useMetricsStore.getState().addRow({ name: 'p2', filePath: null, metrics: { score: 0.5 } })
    const csv = useMetricsStore.getState().exportFilteredCSV()
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(3) // header + 2 data rows
    expect(lines[0]).toContain('name')
    expect(lines[0]).toContain('score')
    expect(lines[1]).toContain('p1')
    expect(lines[2]).toContain('p2')
  })

  it('exports only filtered rows when filterText is set', () => {
    useMetricsStore.getState().addRow({ name: 'alpha', filePath: null, metrics: { score: 0.9 } })
    useMetricsStore.getState().addRow({ name: 'beta',  filePath: null, metrics: { score: 0.5 } })
    useMetricsStore.getState().setFilterText('alpha')
    const csv = useMetricsStore.getState().exportFilteredCSV()
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(2) // header + 1 data row
    expect(lines[1]).toContain('alpha')
    expect(csv).not.toContain('beta')
  })

  it('excludes hidden columns from the export', () => {
    useMetricsStore.getState().addRow({ name: 'p1', filePath: null, metrics: { score: 0.9, binding_energy: 85 } })
    useMetricsStore.getState().setHiddenColumns(['binding_energy'])
    const csv = useMetricsStore.getState().exportFilteredCSV()
    expect(csv).toContain('score')
    expect(csv).not.toContain('binding_energy')
  })

  it('rounds metric values to 4 decimal places', () => {
    useMetricsStore.getState().addRow({ name: 'p1', filePath: null, metrics: { score: 0.123456789 } })
    const csv = useMetricsStore.getState().exportFilteredCSV()
    expect(csv).toContain('0.1235')
    expect(csv).not.toContain('0.123456789')
  })

  it('produces empty body (header only) when all rows are filtered out', () => {
    useMetricsStore.getState().addRow({ name: 'p1', filePath: null, metrics: { score: 0.9 } })
    useMetricsStore.getState().setFilterText('no-match')
    const csv = useMetricsStore.getState().exportFilteredCSV()
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(1) // header only
    expect(lines[0]).toContain('name')
  })
})
