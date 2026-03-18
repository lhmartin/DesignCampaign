import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FileInfo } from '@/types/electron'
import { extractMetricsFromPDB } from '@/lib/parsers/pdb-metrics'
import { getFileStem } from '@/lib/utils'

export interface ProteinMetrics {
  name: string
  filePath: string | null
  metrics: Record<string, number>
}

const BUILTIN_COLS = ['mean_plddt', 'mean_bfactor', 'num_residues', 'chain_count']

interface MetricsStore {
  rows: ProteinMetrics[]
  allColumns: string[]
  hiddenColumns: string[]
  filterText: string
  columnRanges: Record<string, [number | null, number | null]>
  isCalculating: boolean
  isLoadingSidecars: boolean
  progress: number

  calculateAll: (files: FileInfo[], readFile: (p: string) => Promise<string>) => Promise<void>
  /** Try to read <stem>.json next to each PDB/CIF file; silently skip missing ones. Returns count loaded. */
  autoLoadSidecars: (files: FileInfo[], readFile: (p: string) => Promise<string>) => Promise<number>
  addRow: (row: ProteinMetrics) => void
  importCSV: (text: string) => void
  importJSON: (text: string) => void
  /** Like importJSON but always associates the result with a specific filePath + name */
  importJSONSidecar: (text: string, filePath: string, name: string) => void
  exportCSV: () => string
  /** Export only filtered rows, respecting hidden columns. */
  exportFilteredCSV: () => string
  setFilterText: (t: string) => void
  setColumnRange: (col: string, min: number | null, max: number | null) => void
  toggleColumn: (col: string) => void
  /** Bulk-replace the hidden-columns list — used for show-all / hide-all. */
  setHiddenColumns: (cols: string[]) => void
  getFilteredRows: () => ProteinMetrics[]
  /** Rename a row in-place.  No-op if oldName not found or newName already exists. */
  renameRow: (oldName: string, newName: string) => void
  /** Inject a computed column (e.g. rank_score) across all rows, keyed by row name. */
  injectColumn: (colName: string, values: Map<string, number>) => void
  /**
   * Upsert multiple rows that each carry one or more new columns (e.g. from batch
   * interface detection).  Matches existing rows by filePath first, then name.
   * Creates new rows for any file not yet in the metrics table.
   */
  batchInjectResults: (data: Array<{ filePath: string; name: string; metrics: Record<string, number> }>) => void
  clearAll: () => void
}

function mergeColumns(current: string[], newCols: string[]): string[] {
  const set = new Set(current)
  for (const c of newCols) if (!set.has(c)) set.add(c)
  return Array.from(set)
}

/**
 * Upsert rows by filePath (preferred) or name.
 *
 * Match priority: filePath > name
 * On match : MERGE metrics (incoming keys win on conflict; existing unique keys kept),
 *            and preserve the existing row's display name so user renames survive.
 * On no match: append as a new row.
 *
 * This prevents duplicate rows when a sidecar JSON gives a row a different name
 * than the PDB file stem (e.g. sidecar name "design_v1" vs stem "protein_001").
 */
function upsertRows(existing: ProteinMetrics[], incoming: ProteinMetrics[]): ProteinMetrics[] {
  const result: ProteinMetrics[] = [...existing]

  for (const row of incoming) {
    // Prefer filePath match; fall back to name match
    let idx = row.filePath != null
      ? result.findIndex(r => r.filePath != null && r.filePath === row.filePath)
      : -1
    if (idx === -1) idx = result.findIndex(r => r.name === row.name)

    if (idx !== -1) {
      result[idx] = {
        name:     result[idx].name,                           // preserve (may have been renamed)
        filePath: result[idx].filePath ?? row.filePath,       // keep whichever side has the path
        metrics:  { ...result[idx].metrics, ...row.metrics }, // merge; incoming wins on collision
      }
    } else {
      result.push(row)
    }
  }

  return result
}

// ── Spec-compliant JSON metric extraction (§5.3) ─────────────────────────────

/** Keys that carry identity/path metadata, not numeric metrics — always skipped. */
const META_KEYS = new Set([
  'name', 'sequence_name', 'job_id', 'file_path', 'version', 'date',
])

const MAX_SCAN_DEPTH = 4

/**
 * Recursively scan a JSON value and collect all numeric metrics into `out`.
 *
 * Rules (from spec §5.3):
 *  - Scalar number        → out[key] = value
 *  - Array of numbers     → out[key_mean], out[key_min], out[key_max]
 *  - Array of dicts with chain1/chain2 fields → out[key.chain1_chain2.metric]
 *  - Nested object        → recurse with dot-notation key, up to MAX_SCAN_DEPTH
 *  - Meta keys            → always skipped
 */
function scanNode(value: unknown, key: string, depth: number, out: Record<string, number>): void {
  if (depth > MAX_SCAN_DEPTH || value === null || value === undefined) return

  if (typeof value === 'number') {
    if (key) out[key] = value
    return
  }

  if (Array.isArray(value)) {
    if (!key || value.length === 0) return

    // Array of plain numbers → mean / min / max
    if (value.every(x => typeof x === 'number')) {
      const nums = value as number[]
      const sum = nums.reduce((a, b) => a + b, 0)
      out[`${key}_mean`] = sum / nums.length
      out[`${key}_min`]  = Math.min(...nums)
      out[`${key}_max`]  = Math.max(...nums)
      return
    }

    // Array of dicts → chain-pair label extraction
    if (value.every(x => x !== null && typeof x === 'object' && !Array.isArray(x))) {
      for (const item of value as Record<string, unknown>[]) {
        const c1 = item['chain1'] ?? item['chain_1']
        const c2 = item['chain2'] ?? item['chain_2']
        const prefix = (c1 && c2) ? `${key}.${c1}_${c2}` : null
        if (!prefix) continue
        for (const [k2, v2] of Object.entries(item)) {
          if (['chain1', 'chain2', 'chain_1', 'chain_2'].includes(k2)) continue
          if (typeof v2 === 'number') out[`${prefix}.${k2}`] = v2
        }
      }
    }
    return
  }

  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (META_KEYS.has(k)) continue
      const childKey = key ? `${key}.${k}` : k
      scanNode(v, childKey, depth + 1, out)
    }
  }
}

function extractNumericMetrics(data: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  scanNode(data, '', 0, out)
  return out
}

export const useMetricsStore = create<MetricsStore>()(
  persist(
    (set, get) => ({
  rows: [],
  allColumns: BUILTIN_COLS,
  hiddenColumns: [],
  filterText: '',
  columnRanges: {},
  isCalculating: false,
  isLoadingSidecars: false,
  progress: 0,

  renameRow: (oldName, newName) => set(s => {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldName) return {}           // nothing to do
    if (s.rows.some(r => r.name === trimmed)) return {}     // name collision
    return { rows: s.rows.map(r => r.name === oldName ? { ...r, name: trimmed } : r) }
  }),
  injectColumn: (colName, values) => set(s => ({
    rows: s.rows.map(r =>
      values.has(r.name)
        ? { ...r, metrics: { ...r.metrics, [colName]: values.get(r.name)! } }
        : r
    ),
    allColumns: mergeColumns(s.allColumns, [colName]),
  })),

  batchInjectResults: (data) => set(s => {
    const newCols: string[] = ['paratope_residues', 'epitope_residues']
    const incoming: ProteinMetrics[] = data.map(({ filePath, name, metrics }) => {
      for (const k of Object.keys(metrics)) if (!newCols.includes(k)) newCols.push(k)
      return { name, filePath, metrics }
    })
    return {
      rows: upsertRows(s.rows, incoming),
      allColumns: mergeColumns(s.allColumns, newCols),
    }
  }),

  clearAll: () => set({ rows: [], allColumns: BUILTIN_COLS, columnRanges: {}, filterText: '' }),

  addRow: (row) => set(s => ({
    rows: upsertRows(s.rows, [row]),
    allColumns: mergeColumns(s.allColumns, Object.keys(row.metrics)),
  })),

  // ── Calculate from PDB B-factors ─────────────────────────────────────────
  // Process ONE file at a time and yield the event loop between each so the
  // UI (progress bar, responsiveness) stays live throughout.  A batch-of-20
  // approach caused 200–300 ms main-thread blocks because all synchronous
  // PDB parses ran back-to-back after their reads resolved together.
  calculateAll: async (files, readFile) => {
    set({ isCalculating: true, progress: 0 })
    const results: ProteinMetrics[] = []

    for (let i = 0; i < files.length; i++) {
      try {
        const content = await readFile(files[i].path)
        const m = extractMetricsFromPDB(content)
        results.push({
          name: getFileStem(files[i].name),
          filePath: files[i].path,
          metrics: m as unknown as Record<string, number>,
        })
      } catch { /* skip unreadable files */ }

      // Push incremental update and yield to event loop every file
      set(s => ({
        rows: upsertRows(s.rows, results),
        allColumns: mergeColumns(s.allColumns, BUILTIN_COLS),
        progress: (i + 1) / files.length,
      }))
      await new Promise(r => setTimeout(r, 0))
    }

    set({ isCalculating: false, progress: 1 })
  },

  // ── Auto-load JSON sidecars ───────────────────────────────────────────────
  autoLoadSidecars: async (files, readFile) => {
    set({ isLoadingSidecars: true })
    const BATCH = 10
    let loaded = 0

    for (let i = 0; i < files.length; i += BATCH) {
      const batch = files.slice(i, i + BATCH)
      const results: ProteinMetrics[] = []
      const newCols: string[] = []

      await Promise.all(batch.map(async (f) => {
        // Replace the extension with .json to get the sidecar path
        const jsonPath = f.path.replace(/\.(pdb|cif|mmcif)$/i, '.json')
        if (jsonPath === f.path) return // no recognised extension

        try {
          const text = await readFile(jsonPath)
          const stem = getFileStem(f.name)
          const row = parseSidecarJSON(text, f.path, stem)
          if (row) {
            results.push(row)
            newCols.push(...Object.keys(row.metrics))
            loaded++
            console.info(`[sidecars] loaded ${row.metrics ? Object.keys(row.metrics).length : 0} metrics from ${jsonPath.split('/').pop()}`)
          } else {
            console.warn(`[sidecars] ${jsonPath.split('/').pop()} parsed but produced no numeric metrics`)
          }
        } catch (err) {
          // ENOENT (file not found) is expected for structures without sidecars — skip silently.
          // Any other error is likely a bug — log it.
          const msg = err instanceof Error ? err.message : String(err)
          if (!msg.includes('ENOENT') && !msg.includes('no such file') && !msg.includes('NotFound')) {
            console.error(`[sidecars] failed to read ${jsonPath}:`, err)
          }
        }
      }))

      if (results.length > 0) {
        set(s => ({
          rows: upsertRows(s.rows, results),
          allColumns: mergeColumns(s.allColumns, newCols),
        }))
      }

      await new Promise(r => setTimeout(r, 0))
    }

    set({ isLoadingSidecars: false })
    return loaded
  },

  // ── CSV import ────────────────────────────────────────────────────────────
  importCSV: (text) => {
    const lines = text.trim().split('\n').filter(l => l.trim())
    if (lines.length < 2) return
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
    const metricCols = headers.slice(1)
    const newRows: ProteinMetrics[] = []
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''))
      const name = cells[0] || ''
      if (!name) continue
      const metrics: Record<string, number> = {}
      metricCols.forEach((col, idx) => {
        const v = parseFloat(cells[idx + 1])
        if (!isNaN(v)) metrics[col] = v
      })
      newRows.push({ name, filePath: null, metrics })
    }
    if (newRows.length === 0) return
    set(s => ({
      rows: upsertRows(s.rows, newRows),
      allColumns: mergeColumns(s.allColumns, metricCols),
    }))
  },

  // ── JSON import (manual, multiple files) ─────────────────────────────────
  importJSON: (text) => {
    let data: unknown
    try { data = JSON.parse(text) } catch { return }

    const newRows: ProteinMetrics[] = []
    let metricCols: string[] = []

    // Format A: { proteins: { name, metrics }[] }
    if (data && typeof data === 'object' && 'proteins' in (data as object)) {
      const d = data as { proteins: { name: string; metrics: Record<string, number> }[] }
      for (const p of d.proteins) {
        newRows.push({ name: p.name, filePath: null, metrics: p.metrics })
        metricCols = mergeColumns(metricCols, Object.keys(p.metrics))
      }
    // Format B: array of { name, metrics }
    } else if (Array.isArray(data)) {
      for (const p of data as { name: string; metrics: Record<string, number> }[]) {
        if (p.name && p.metrics) {
          newRows.push({ name: p.name, filePath: null, metrics: p.metrics })
          metricCols = mergeColumns(metricCols, Object.keys(p.metrics))
        }
      }
    // Format C: single-protein flat object (or unknown schema — extract all numbers)
    } else if (data && typeof data === 'object') {
      const metrics = extractNumericMetrics(data)
      const cols = Object.keys(metrics)
      if (cols.length > 0) {
        newRows.push({ name: 'imported', filePath: null, metrics })
        metricCols = cols
      }
    }

    if (newRows.length === 0) return
    set(s => ({
      rows: upsertRows(s.rows, newRows),
      allColumns: mergeColumns(s.allColumns, metricCols),
    }))
  },

  // ── JSON sidecar import ───────────────────────────────────────────────────
  importJSONSidecar: (text, filePath, name) => {
    const row = parseSidecarJSON(text, filePath, name)
    if (!row) return
    set(s => ({
      rows: upsertRows(s.rows, [row]),
      allColumns: mergeColumns(s.allColumns, Object.keys(row.metrics)),
    }))
  },

  // ── Export ────────────────────────────────────────────────────────────────
  exportCSV: () => {
    const { rows, allColumns } = get()
    const header = ['name', ...allColumns].join(',')
    const body = rows.map(r =>
      [r.name, ...allColumns.map(c => r.metrics[c]?.toFixed(4) ?? '')].join(',')
    ).join('\n')
    return header + '\n' + body
  },

  exportFilteredCSV: () => {
    const { hiddenColumns, allColumns } = get()
    const filteredRows = get().getFilteredRows()
    const visibleCols = allColumns.filter(c => !hiddenColumns.includes(c))
    const header = ['name', ...visibleCols].join(',')
    const body = filteredRows.map(r =>
      [r.name, ...visibleCols.map(c => r.metrics[c]?.toFixed(4) ?? '')].join(',')
    ).join('\n')
    return header + '\n' + body
  },

  setFilterText: (filterText) => set({ filterText }),

  setColumnRange: (col, min, max) =>
    set(s => ({ columnRanges: { ...s.columnRanges, [col]: [min, max] } })),

  toggleColumn: (col) =>
    set(s => ({
      hiddenColumns: s.hiddenColumns.includes(col)
        ? s.hiddenColumns.filter(c => c !== col)
        : [...s.hiddenColumns, col],
    })),

  setHiddenColumns: (cols) => set({ hiddenColumns: cols }),

  getFilteredRows: () => {
    const { rows, filterText, columnRanges } = get()
    return rows.filter(row => {
      if (filterText && !row.name.toLowerCase().includes(filterText.toLowerCase())) return false
      for (const [col, [min, max]] of Object.entries(columnRanges)) {
        const v = row.metrics[col]
        if (v === undefined) continue
        if (min !== null && v < min) return false
        if (max !== null && v > max) return false
      }
      return true
    })
  },
    }),
    {
      name: 'dc-metrics-prefs',
      partialize: (s) => ({ hiddenColumns: s.hiddenColumns }),
    },
  ),
)

// ── Sidecar JSON parser ───────────────────────────────────────────────────────
// Handles all three spec formats and stamps the result with the given filePath.
// Name resolution priority (§5.3): sequence_name → job_id → name field → filename stem

function resolveNameFromJSON(data: unknown, stem: string): string {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return stem
  const d = data as Record<string, unknown>
  if (typeof d['sequence_name'] === 'string' && d['sequence_name']) return d['sequence_name']
  if (typeof d['job_id'] === 'string'       && d['job_id'])       return d['job_id']
  if (typeof d['name'] === 'string'          && d['name'])          return d['name']
  return stem
}

function parseSidecarJSON(text: string, filePath: string, stem: string): ProteinMetrics | null {
  let data: unknown
  try { data = JSON.parse(text) } catch (e) {
    console.warn('[sidecars] JSON parse error:', e)
    return null
  }

  let metrics: Record<string, number> = {}
  let name = stem

  // Format A: { proteins: [...] } — take the entry whose name matches stem, or first
  if (data && typeof data === 'object' && !Array.isArray(data) && 'proteins' in (data as object)) {
    const d = data as { proteins: { name?: string; metrics?: Record<string, number> }[] }
    const match = d.proteins.find(p => p.name === stem) ?? d.proteins[0]
    if (match?.metrics) {
      metrics = match.metrics
      name = match.name ?? stem
    }

  // Format B: array of { name, metrics } — find matching name or take first
  } else if (Array.isArray(data)) {
    const arr = data as { name?: string; metrics?: Record<string, number> }[]
    const match = arr.find(p => p.name === stem) ?? arr[0]
    if (match?.metrics) {
      metrics = match.metrics
      name = match.name ?? stem
    }

  // Format C / unknown: arbitrary JSON — recursive numeric extraction (spec §5.3)
  } else if (data && typeof data === 'object') {
    metrics = extractNumericMetrics(data)
    name = resolveNameFromJSON(data, stem)
  }

  if (Object.keys(metrics).length === 0) return null
  return { name, filePath, metrics }
}
