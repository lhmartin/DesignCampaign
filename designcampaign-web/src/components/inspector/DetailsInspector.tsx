import { useFileStore } from '@/stores/file-store'
import { useMetricsStore } from '@/stores/metrics-store'
import { useSelectionStore } from '@/stores/selection-store'
import { useInterfaceStore } from '@/stores/interface-store'
import { getFileName, getFileStem, getFileExt } from '@/lib/utils'

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-text-secondary)',
  padding: '8px 12px 6px',
  borderBottom: '1px solid var(--color-border)',
  background: 'var(--color-secondary-bg)',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  padding: '4px 12px',
  fontSize: 12,
  lineHeight: 1.35,
  gap: 8,
}

const keyStyle: React.CSSProperties = {
  color: 'var(--color-text-secondary)',
  whiteSpace: 'nowrap',
}

const valStyle: React.CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  color: 'var(--color-text-primary)',
  textAlign: 'right',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '60%',
}

function fmtNum(v: number | undefined): string {
  if (v === undefined || Number.isNaN(v)) return '—'
  if (Number.isInteger(v)) return v.toString()
  return v.toFixed(2)
}

export function DetailsInspector() {
  const activeFile = useFileStore(s => s.activeFile)
  // Narrow the metrics selector so unrelated row updates don't re-render the inspector.
  const metricsRow = useMetricsStore(s => {
    if (!activeFile) return undefined
    const stem = getFileStem(activeFile)
    return s.rows.find(r => r.filePath === activeFile) ?? s.rows.find(r => r.name === stem)
  })
  // Use the store's column order so the inspector matches the metrics table.
  const allColumns = useMetricsStore(s => s.allColumns)
  const selectedResidues = useSelectionStore(s => s.selectedResidues)
  const paratopeSize = useInterfaceStore(s => s.paratope.size)
  const epitopeSize  = useInterfaceStore(s => s.epitope.size)

  let selectionSummary: { count: number; chains: string[] } | null = null
  if (selectedResidues.size > 0) {
    const chains = new Set<string>()
    for (const k of selectedResidues) {
      const c = k.split(':')[0]
      if (c) chains.add(c)
    }
    selectionSummary = { count: selectedResidues.size, chains: Array.from(chains).sort() }
  }

  if (!activeFile) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        color: 'var(--color-text-disabled)',
        fontSize: 12,
        textAlign: 'center',
      }}>
        No file selected
      </div>
    )
  }

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'auto',
      minHeight: 0,
    }}>
      <div style={sectionHeaderStyle}>Active file</div>
      <div style={rowStyle}>
        <span style={keyStyle}>Name</span>
        <span style={valStyle} title={getFileName(activeFile)}>{getFileName(activeFile)}</span>
      </div>
      <div style={rowStyle}>
        <span style={keyStyle}>Path</span>
        <span style={{ ...valStyle, direction: 'rtl' }} title={activeFile}>{activeFile}</span>
      </div>
      <div style={rowStyle}>
        <span style={keyStyle}>Format</span>
        <span style={valStyle}>{getFileExt(activeFile) || '—'}</span>
      </div>

      <div style={sectionHeaderStyle}>Metrics</div>
      {(() => {
        const m = metricsRow?.metrics
        if (!m) {
          return (
            <div style={{ ...rowStyle, color: 'var(--color-text-disabled)' }}>
              <span>No metrics for this file</span>
            </div>
          )
        }
        const cols = allColumns.filter(c => c in m)
        const extra = Object.keys(m).filter(k => !allColumns.includes(k))
        const ordered = [...cols, ...extra]
        if (ordered.length === 0) {
          return (
            <div style={{ ...rowStyle, color: 'var(--color-text-disabled)' }}>
              <span>No metrics for this file</span>
            </div>
          )
        }
        return ordered.map(key => (
          <div key={key} style={rowStyle}>
            <span style={{ ...keyStyle, overflow: 'hidden', textOverflow: 'ellipsis' }} title={key}>{key}</span>
            <span style={valStyle}>{fmtNum(m[key])}</span>
          </div>
        ))
      })()}

      <div style={sectionHeaderStyle}>Selection</div>
      {selectionSummary ? (
        <>
          <div style={rowStyle}>
            <span style={keyStyle}>Residues</span>
            <span style={valStyle}>{selectionSummary.count}</span>
          </div>
          <div style={rowStyle}>
            <span style={keyStyle}>Chains</span>
            <span style={valStyle}>{selectionSummary.chains.join(', ')}</span>
          </div>
        </>
      ) : (
        <div style={{ ...rowStyle, color: 'var(--color-text-disabled)' }}>
          <span>No residues selected</span>
        </div>
      )}
      {paratopeSize + epitopeSize > 0 && (
        <div style={rowStyle}>
          <span style={keyStyle}>Interface</span>
          <span style={valStyle}>{paratopeSize} + {epitopeSize}</span>
        </div>
      )}
    </div>
  )
}
