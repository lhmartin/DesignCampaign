import { useMemo } from 'react'
import { useSelectionStore, type SelectionKey } from '@/stores/selection-store'
import { useFileStore } from '@/stores/file-store'

/** Parse a "chainId:resId" key into its parts. */
function parseKey(key: SelectionKey): { chain: string; resId: number } {
  const idx = key.lastIndexOf(':')
  return { chain: key.slice(0, idx), resId: Number(key.slice(idx + 1)) }
}

export function SelectionPanel() {
  const { selectedResidues, clearSelection, invertSelection } = useSelectionStore()
  const { activeFile } = useFileStore()

  // Group selected residues by chain
  const byChain = useMemo(() => {
    const map = new Map<string, number[]>()
    for (const key of selectedResidues) {
      const { chain, resId } = parseKey(key)
      if (!map.has(chain)) map.set(chain, [])
      map.get(chain)!.push(resId)
    }
    // Sort residue IDs within each chain
    for (const ids of map.values()) ids.sort((a, b) => a - b)
    // Sort chains
    return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)))
  }, [selectedResidues])

  const totalSelected = selectedResidues.size

  /** Export selected residues as a simple FASTA-like text listing. */
  const handleExportList = () => {
    const lines: string[] = [`# Selected residues — ${activeFile?.split('/').pop() ?? 'unknown'}`]
    for (const [chain, ids] of byChain) {
      lines.push(`Chain ${chain}: ${ids.join(', ')}`)
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'selection.txt'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="flex flex-col h-full text-xs text-[var(--color-text-primary)]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] shrink-0">
        <span className="font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide text-[10px]">
          Selection
        </span>
        {totalSelected > 0 && (
          <span className="ml-auto px-1.5 py-0.5 rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent)] font-mono text-[10px]">
            {totalSelected}
          </span>
        )}
        {totalSelected > 0 && (
          <>
            <button
              onClick={handleExportList}
              className="px-2 py-0.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-secondary-bg)] transition-colors"
              title="Export selection as text"
            >
              Export
            </button>
            <button
              onClick={clearSelection}
              className="px-2 py-0.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-secondary-bg)] transition-colors text-red-500 hover:text-red-600"
              title="Clear all selected residues"
            >
              Clear
            </button>
          </>
        )}
      </div>

      {/* Instructions when nothing is selected */}
      {totalSelected === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 text-[var(--color-text-disabled)] gap-2 px-6 text-center">
          <span className="text-2xl">🖱️</span>
          <p>Click residues in the 3D viewer to select them.</p>
          <p className="text-[10px]">Hold <kbd className="px-1 py-0.5 rounded bg-[var(--color-secondary-bg)] border border-[var(--color-border)] font-mono">Ctrl</kbd> to add/remove individual residues.</p>
        </div>
      )}

      {/* Selection list grouped by chain */}
      {totalSelected > 0 && (
        <div className="flex-1 overflow-y-auto">
          {[...byChain.entries()].map(([chain, ids]) => (
            <div key={chain}>
              {/* Chain header */}
              <div className="sticky top-0 px-3 py-1 bg-[var(--color-secondary-bg)] border-b border-[var(--color-border)] flex items-center gap-2">
                <span className="font-semibold text-[var(--color-text-secondary)] text-[10px] uppercase tracking-wide">
                  Chain {chain}
                </span>
                <span className="text-[10px] text-[var(--color-text-disabled)]">{ids.length} residue{ids.length !== 1 ? 's' : ''}</span>
                <span className="ml-auto text-[10px] font-mono text-[var(--color-text-secondary)]">
                  {compactRanges(ids)}
                </span>
              </div>

              {/* Residue grid */}
              <div className="p-2 flex flex-wrap gap-1">
                {ids.map(id => (
                  <button
                    key={id}
                    onClick={() => {
                      const key: SelectionKey = `${chain}:${id}`
                      const next = new Set(useSelectionStore.getState().selectedResidues)
                      next.delete(key)
                      useSelectionStore.setState({ selectedResidues: next })
                    }}
                    title={`Remove ${chain}:${id} from selection`}
                    className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/25 hover:bg-red-50 hover:border-red-200 hover:text-red-600 dark:hover:bg-red-950/30 transition-colors"
                  >
                    {id}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Format a sorted array of integers as compact range notation, e.g. "1–5, 8, 10–12" */
function compactRanges(ids: number[]): string {
  if (ids.length === 0) return ''
  const ranges: string[] = []
  let start = ids[0], end = ids[0]
  for (let i = 1; i < ids.length; i++) {
    if (ids[i] === end + 1) {
      end = ids[i]
    } else {
      ranges.push(start === end ? `${start}` : `${start}–${end}`)
      start = end = ids[i]
    }
  }
  ranges.push(start === end ? `${start}` : `${start}–${end}`)
  return ranges.join(', ')
}
