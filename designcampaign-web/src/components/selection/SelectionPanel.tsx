import { useMemo } from 'react'
import { useSelectionStore, type SelectionKey } from '@/stores/selection-store'
import { useInterfaceStore } from '@/stores/interface-store'
import { useFileStore } from '@/stores/file-store'
import { downloadBlob } from '@/lib/utils'

/** Parse a "chainId:resId" key into its parts. */
function parseKey(key: SelectionKey): { chain: string; resId: number } {
  const idx = key.lastIndexOf(':')
  return { chain: key.slice(0, idx), resId: Number(key.slice(idx + 1)) }
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

/** Group a set of SelectionKeys by chain, returning sorted Map<chain, sortedResIds[]>. */
function groupByChain(keys: Set<SelectionKey>): Map<string, number[]> {
  const map = new Map<string, number[]>()
  for (const key of keys) {
    const { chain, resId } = parseKey(key)
    if (!map.has(chain)) map.set(chain, [])
    map.get(chain)!.push(resId)
  }
  for (const ids of map.values()) ids.sort((a, b) => a - b)
  return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

// ── Named interface group (epitope or paratope) ───────────────────────────────

function InterfaceGroup({
  label,
  filename,
  keys,
  accentColor,
}: {
  label: string
  filename: string
  keys: Set<SelectionKey>
  accentColor: string
}) {
  const byChain = useMemo(() => groupByChain(keys), [keys])

  const handleExport = () => {
    const lines = [`# ${label} — ${filename}`]
    for (const [chain, ids] of byChain) {
      lines.push(`Chain ${chain}: ${ids.join(', ')}`)
    }
    downloadBlob(lines.join('\n'), `${label.toLowerCase().replace(/\s+/g, '-')}.txt`)
  }

  const handleSelectInViewer = () => {
    useSelectionStore.getState().selectAll(Array.from(keys))
  }

  return (
    <div style={{ borderBottom: '1px solid var(--color-border)' }}>
      {/* Group header */}
      <div style={{
        position: 'sticky', top: 0,
        padding: '6px 12px',
        background: `color-mix(in srgb, ${accentColor} 8%, var(--color-secondary-bg))`,
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: accentColor,
        }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: accentColor, flex: 1 }}>
          {label}
        </span>
        <span style={{ fontSize: 10, color: 'var(--color-text-disabled)' }}>
          {keys.size} res
        </span>
        <button
          onClick={handleSelectInViewer}
          title="Highlight in viewer"
          style={{
            fontSize: 9, padding: '1px 6px', borderRadius: 4,
            border: `1px solid ${accentColor}40`,
            background: 'transparent', color: accentColor,
            cursor: 'pointer',
          }}
        >Select</button>
        <button
          onClick={handleExport}
          title="Export as text file"
          style={{
            fontSize: 9, padding: '1px 6px', borderRadius: 4,
            border: '1px solid var(--color-border)',
            background: 'transparent', color: 'var(--color-text-secondary)',
            cursor: 'pointer',
          }}
        >Export</button>
      </div>

      {/* Residue list per chain */}
      {[...byChain.entries()].map(([chain, ids]) => (
        <div key={chain}>
          <div style={{
            padding: '3px 12px',
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--color-secondary-bg)',
          }}>
            <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Chain {chain}
            </span>
            <span style={{ fontSize: 9, color: 'var(--color-text-disabled)', marginLeft: 'auto', fontFamily: 'JetBrains Mono, monospace' }}>
              {compactRanges(ids)}
            </span>
          </div>
          <div style={{ padding: '4px 8px', display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {ids.map(id => (
              <span
                key={id}
                style={{
                  padding: '1px 5px', borderRadius: 6, fontSize: 9,
                  fontFamily: 'JetBrains Mono, monospace',
                  background: `color-mix(in srgb, ${accentColor} 12%, transparent)`,
                  color: accentColor,
                  border: `1px solid ${accentColor}30`,
                }}
              >
                {id}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function SelectionPanel() {
  const { selectedResidues, clearSelection } = useSelectionStore()
  const paratope = useInterfaceStore(s => s.paratope)
  const epitope  = useInterfaceStore(s => s.epitope)
  const { activeFile } = useFileStore()

  const filename = activeFile?.split('/').pop() ?? 'unknown'

  // Group selected residues by chain
  const byChain = useMemo(() => groupByChain(selectedResidues), [selectedResidues])

  const totalSelected = selectedResidues.size
  const hasInterface  = paratope.size > 0 || epitope.size > 0

  /** Export selected residues as a simple text listing. */
  const handleExportList = () => {
    const lines: string[] = [`# Selected residues — ${filename}`]
    for (const [chain, ids] of byChain) {
      lines.push(`Chain ${chain}: ${ids.join(', ')}`)
    }
    downloadBlob(lines.join('\n'), 'selection.txt')
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

      {/* Empty state when nothing at all */}
      {totalSelected === 0 && !hasInterface && (
        <div className="flex flex-col items-center justify-center flex-1 text-[var(--color-text-disabled)] gap-2 px-6 text-center">
          <span className="text-2xl">🖱️</span>
          <p>Click residues in the 3D viewer to select them.</p>
          <p className="text-[10px]">Hold <kbd className="px-1 py-0.5 rounded bg-[var(--color-secondary-bg)] border border-[var(--color-border)] font-mono">Ctrl</kbd> to add/remove individual residues.</p>
          <p className="text-[10px] mt-1 text-[var(--color-text-disabled)]">Use the <strong>Interface</strong> button in the viewer toolbar to detect epitope &amp; paratope residues.</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* ── Interface groups ── */}
        {paratope.size > 0 && (
          <InterfaceGroup
            label="Paratope (binder)"
            filename={filename}
            keys={paratope}
            accentColor="#38bdf8"
          />
        )}
        {epitope.size > 0 && (
          <InterfaceGroup
            label="Epitope (target)"
            filename={filename}
            keys={epitope}
            accentColor="#f87171"
          />
        )}

        {/* ── Manual selection ── */}
        {totalSelected > 0 && (
          <div>
            {hasInterface && (
              <div style={{
                padding: '5px 12px',
                fontSize: 10, fontWeight: 600,
                color: 'var(--color-text-secondary)',
                textTransform: 'uppercase', letterSpacing: '0.04em',
                borderBottom: '1px solid var(--color-border)',
                background: 'var(--color-secondary-bg)',
              }}>
                Manual Selection
              </div>
            )}
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
    </div>
  )
}
