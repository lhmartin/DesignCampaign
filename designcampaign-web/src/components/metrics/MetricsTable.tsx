import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import { useMetricsStore, type ProteinMetrics } from '@/stores/metrics-store'
import { useFileStore } from '@/stores/file-store'
import { useProteinStore } from '@/stores/protein-store'
import type { MolstarViewerHandle } from '@/components/viewer/MolstarViewer'
import { readFileContent } from '@/lib/fsa'

const BUILTIN_LABELS: Record<string, string> = {
  mean_plddt: 'pLDDT',
  mean_bfactor: 'B-factor',
  num_residues: 'Residues',
  chain_count: 'Chains',
}

/**
 * Display label for a column key.
 * Built-in columns use their friendly name; sidecar columns with deep dot-notation
 * paths (e.g. "payload.job_status.response_payload.plddt") show only the last segment.
 */
function shortLabel(col: string): string {
  return BUILTIN_LABELS[col] ?? col.split('.').pop() ?? col
}

const helper = createColumnHelper<ProteinMetrics>()

interface MetricsTableProps {
  viewerRef: RefObject<MolstarViewerHandle | null>
}

// ── Inline rename cell ────────────────────────────────────────────────────────

function NameCell({
  name,
  onRename,
}: {
  name: string
  onRename: (oldName: string, newName: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)
  // Prevents double-commit: when Enter fires commit(), React removes the input
  // from the DOM which triggers onBlur, which would fire commit() a second time.
  const committedRef = useRef(false)

  const commit = () => {
    if (committedRef.current) return
    committedRef.current = true
    onRename(name, draft)
    setEditing(false)
  }

  const cancel = () => {
    committedRef.current = true   // also guard cancel so blur after Escape is a no-op
    setDraft(name)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        autoFocus
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter')  { e.preventDefault(); commit() }
          if (e.key === 'Escape') { e.preventDefault(); cancel() }
        }}
        // Prevent row double-click (load structure) from firing while renaming
        onClick={e => e.stopPropagation()}
        onDoubleClick={e => e.stopPropagation()}
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11,
          background: 'var(--color-secondary-bg)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--color-accent)',
          borderRadius: 3,
          padding: '1px 4px',
          width: '100%',
          outline: 'none',
        }}
      />
    )
  }

  return (
    <span
      title="Double-click to rename"
      onDoubleClick={e => {
        e.stopPropagation()   // don't trigger the row's load-structure double-click
        committedRef.current = false
        setDraft(name)
        setEditing(true)
      }}
      style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        display: 'block',
        maxWidth: 200,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        cursor: 'text',
      }}
    >
      {name}
    </span>
  )
}

// ── Column visibility dropdown ────────────────────────────────────────────────

function ColumnsDropdown({
  allColumns,
  hiddenColumns,
  toggleColumn,
  setHiddenColumns,
}: {
  allColumns: string[]
  hiddenColumns: string[]
  toggleColumn: (col: string) => void
  setHiddenColumns: (cols: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const hiddenCount = hiddenColumns.filter(c => allColumns.includes(c)).length

  const btnBase: React.CSSProperties = {
    fontSize: 10,
    padding: '1px 6px',
    borderRadius: 3,
    border: '1px solid var(--color-border)',
    background: 'none',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'background 0.15s',
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', marginLeft: 'auto' }}>
      <button
        onClick={() => setOpen(p => !p)}
        className="px-2 py-0.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-secondary-bg)] transition-colors"
        style={{ minWidth: 90 }}
      >
        Columns{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ''} ▾
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          right: 0,
          zIndex: 200,
          background: 'var(--color-secondary-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 6,
          padding: '6px 0 4px',
          minWidth: 200,
          maxHeight: 320,
          overflowY: 'auto',
          boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
        }}>
          {/* Show all / Hide all */}
          <div style={{
            display: 'flex', gap: 6, padding: '0 10px 6px',
            borderBottom: '1px solid var(--color-border)', marginBottom: 4,
          }}>
            <button style={btnBase} onClick={() => setHiddenColumns([])}>
              Show all
            </button>
            <button style={btnBase} onClick={() => setHiddenColumns([...allColumns])}>
              Hide all
            </button>
          </div>

          {allColumns.map(col => {
            const visible = !hiddenColumns.includes(col)
            return (
              <label
                key={col}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 12px',
                  cursor: 'pointer',
                  fontSize: 11,
                  color: visible ? 'var(--color-text-primary)' : 'var(--color-text-disabled)',
                  userSelect: 'none',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-accent-subtle, rgba(0,200,168,0.08))')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={() => toggleColumn(col)}
                  style={{ accentColor: 'var(--color-accent)', cursor: 'pointer' }}
                />
                <span style={{
                  fontFamily: BUILTIN_LABELS[col] ? 'inherit' : 'JetBrains Mono, monospace',
                  fontSize: BUILTIN_LABELS[col] ? 11 : 10,
                }}>
                  {shortLabel(col)}
                </span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export function MetricsTable({ viewerRef }: MetricsTableProps) {
  const {
    rows, allColumns, hiddenColumns, filterText, columnRanges,
    isCalculating, isLoadingSidecars, progress,
    setFilterText, toggleColumn, setHiddenColumns, exportCSV, importCSV, importJSON,
    getFilteredRows, calculateAll, renameRow,
  } = useMetricsStore()
  const { files } = useFileStore()
  const { setLoading } = useProteinStore()
  const [sorting, setSorting] = useState<SortingState>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Stable references — only recompute when the actual underlying data changes.
  // Without these memos, allColumns.filter() and getFilteredRows() both return
  // new array references every render, causing `columns` useMemo and
  // useReactTable to fully rebuild on every keystroke / store tick.
  const visibleColumns = useMemo(
    () => allColumns.filter(c => !hiddenColumns.includes(c)),
    [allColumns, hiddenColumns],
  )
  const filteredRows = useMemo(
    () => getFilteredRows(),
    [rows, filterText, columnRanges], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Drop any sort entries that reference a now-hidden column — prevents
  // getSortedRowModel() from throwing when it can't find the column id.
  useEffect(() => {
    setSorting(prev => {
      if (prev.length === 0) return prev
      const valid = new Set([...visibleColumns, 'name'])
      const next = prev.filter(s => valid.has(s.id))
      return next.length === prev.length ? prev : next
    })
  }, [visibleColumns.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // Name column is rendered LAST — metric columns come first
  const columns = useMemo(() => [
    ...visibleColumns.map(col =>
      helper.accessor(row => row.metrics[col], {
        id: col,
        header: shortLabel(col),
        cell: info => {
          const v = info.getValue()
          return v !== undefined ? (
            <span className="text-xs tabular-nums">{typeof v === 'number' ? v.toFixed(2) : v}</span>
          ) : <span className="text-xs text-[var(--color-text-disabled)]">—</span>
        },
        sortingFn: 'alphanumeric',
      })
    ),
    // Name last
    helper.accessor('name', {
      header: 'Name',
      cell: info => (
        <NameCell name={info.getValue()} onRename={renameRow} />
      ),
      size: 200,
    }),
  ], [visibleColumns, renameRow])

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const handleDoubleClick = async (row: ProteinMetrics) => {
    const file = files.find(f => f.path === row.filePath || f.name.replace(/\.[^.]+$/, '') === row.name)
    if (!file) return
    useFileStore.getState().setActiveFile(file.path)
    setLoading(true)
    try { await viewerRef.current?.loadFromFile(file.path) }
    finally { setLoading(false) }
  }

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (fileList.length === 0) return
    for (const file of fileList) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const text = ev.target?.result as string
        if (file.name.endsWith('.csv')) importCSV(text)
        else importJSON(text)
      }
      reader.readAsText(file)
    }
  }

  const handleExport = () => {
    const csv = exportCSV()
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'metrics.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const handleCalculate = () => {
    const readFile = window.electronAPI
      ? (p: string) => window.electronAPI!.readFile(p)
      : readFileContent
    calculateAll(files, readFile)
  }

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Toolbar */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[var(--color-border)] shrink-0 flex-wrap">
        <input
          type="text"
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
          placeholder="Filter by name…"
          className="px-2 py-0.5 rounded border border-[var(--color-border)] bg-[var(--color-secondary-bg)] text-[var(--color-text-primary)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)] w-36"
        />
        <button
          onClick={handleCalculate}
          disabled={isCalculating || files.length === 0}
          className="px-2 py-0.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-secondary-bg)] disabled:opacity-50 transition-colors"
        >
          {isCalculating ? `${Math.round(progress * 100)}%…` : 'Calculate All'}
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoadingSidecars}
          className="px-2 py-0.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-secondary-bg)] disabled:opacity-50 transition-colors"
        >
          Import CSV / JSON
        </button>
        <input ref={fileInputRef} type="file" accept=".csv,.json" multiple className="hidden" onChange={handleImportFile} />
        <button
          onClick={handleExport}
          disabled={filteredRows.length === 0}
          className="px-2 py-0.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-secondary-bg)] disabled:opacity-50 transition-colors"
        >
          Export CSV
        </button>

        <ColumnsDropdown
          allColumns={allColumns}
          hiddenColumns={hiddenColumns}
          toggleColumn={toggleColumn}
          setHiddenColumns={setHiddenColumns}
        />
      </div>

      {/* Progress bars */}
      {isCalculating && (
        <div className="h-0.5 bg-[var(--color-border)] shrink-0">
          <div className="h-full bg-[var(--color-accent)] transition-all" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      {isLoadingSidecars && !isCalculating && (
        <div className="h-0.5 bg-[var(--color-border)] shrink-0 overflow-hidden">
          <div className="h-full bg-[var(--color-accent)] opacity-60 animate-pulse w-full" />
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {filteredRows.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--color-text-disabled)] text-xs px-4 text-center">
            {files.length === 0
              ? 'Open a folder to calculate metrics'
              : 'Click "Calculate All" or import a CSV/JSON file'}
          </div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-[var(--color-secondary-bg)] z-10">
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id} className="border-b border-[var(--color-border)]">
                  {hg.headers.map(header => (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className="px-2 py-1 text-left font-medium text-[var(--color-text-secondary)] whitespace-nowrap cursor-pointer hover:text-[var(--color-text-primary)] select-none"
                      style={{ width: header.getSize() }}
                    >
                      <span className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' && ' ↑'}
                        {header.column.getIsSorted() === 'desc' && ' ↓'}
                      </span>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row, i) => (
                <tr
                  key={row.id}
                  onDoubleClick={() => handleDoubleClick(row.original)}
                  className={`border-b border-[var(--color-border)] cursor-pointer hover:bg-[var(--color-accent)]/10 ${i % 2 === 0 ? '' : 'bg-[var(--color-secondary-bg)]/50'}`}
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-2 py-1 whitespace-nowrap">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Status bar */}
      {filteredRows.length > 0 && (
        <div className="px-2 py-1 text-[10px] text-[var(--color-text-secondary)] border-t border-[var(--color-border)] shrink-0">
          {filteredRows.length} of {rows.length} rows · double-click row to load · double-click name to rename
        </div>
      )}
    </div>
  )
}
