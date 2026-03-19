import { useEffect, useRef, useMemo } from 'react'
import { useMetricsStore } from '@/stores/metrics-store'
import { useFilterStore } from '@/stores/filter-store'
import { shortLabel } from '@/lib/metrics-labels'
import { useIsDark } from '@/hooks/useIsDark'
import { useActiveRows } from '@/hooks/useActiveRows'
import { PLOTLY_DARK, PLOTLY_LIGHT } from '@/lib/constants/plotly-theme'

// ── Pearson r ─────────────────────────────────────────────────────────────────

function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length
  if (n < 2) return NaN
  let sx = 0, sy = 0
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i] }
  const mx = sx / n, my = sy / n
  let num = 0, dx2 = 0, dy2 = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my
    num += dx * dy
    dx2 += dx * dx
    dy2 += dy * dy
  }
  const denom = Math.sqrt(dx2 * dy2)
  return denom === 0 ? NaN : num / denom
}

// Diverging colorscale: blue (-1) → white (0) → red (+1)
const COLORSCALE: [number, string][] = [
  [0,    '#2166ac'],
  [0.25, '#92c5de'],
  [0.5,  '#f7f7f7'],
  [0.75, '#f4a582'],
  [1,    '#d6604d'],
]

const PLOT_CONFIG = { displayModeBar: false, responsive: true }

// ─────────────────────────────────────────────────────────────────────────────

export function CorrelationHeatmap() {
  const plotRef = useRef<HTMLDivElement>(null)

  const { rows, allColumns, hiddenColumns, filterText } = useMetricsStore()
  const { rules: filterRules } = useFilterStore()
  const isDark = useIsDark()

  const theme = useMemo(() => isDark ? PLOTLY_DARK : PLOTLY_LIGHT, [isDark])

  const visibleCols = useMemo(
    () => allColumns.filter(c => !hiddenColumns.includes(c)),
    [allColumns, hiddenColumns],
  )

  const activeRows = useActiveRows(rows, filterText, filterRules)

  // Build NxN Pearson r matrix — compute only upper triangle, mirror to lower
  const matrix = useMemo((): number[][] | null => {
    if (activeRows.length < 3 || visibleCols.length < 2) return null
    const n = visibleCols.length
    const mat: number[][] = Array.from({ length: n }, () => Array(n).fill(NaN))
    for (let i = 0; i < n; i++) {
      mat[i][i] = 1
      for (let j = i + 1; j < n; j++) {
        const xs: number[] = [], ys: number[] = []
        for (const r of activeRows) {
          const x = r.metrics[visibleCols[i]], y = r.metrics[visibleCols[j]]
          if (isFinite(x) && isFinite(y)) { xs.push(x); ys.push(y) }
        }
        const val = pearsonR(xs, ys)
        mat[i][j] = val
        mat[j][i] = val
      }
    }
    return mat
  }, [activeRows, visibleCols])

  // Build Plotly spec from matrix + theme
  const plotSpec = useMemo(() => {
    if (!matrix) return null

    const labels = visibleCols.map(c => shortLabel(c))
    const n = visibleCols.length

    const trace = {
      type: 'heatmap',
      z: matrix,
      x: labels,
      y: labels,
      zmin: -1,
      zmax: 1,
      colorscale: COLORSCALE,
      showscale: true,
      colorbar: {
        thickness: 12,
        len: 0.75,
        tickfont: { size: 9, color: theme.tick },
        tickvals: [-1, -0.5, 0, 0.5, 1],
        ticktext: ['-1', '-½', '0', '+½', '+1'],
        title: { text: 'r', font: { size: 9, color: theme.tick } },
      },
      hovertemplate: '%{y} vs %{x}<br>r = %{z:.3f}<extra></extra>',
    }

    // Per-cell annotations — compute upper triangle and mirror (avoids N² allocations)
    const annotations: object[] = []
    for (let row = 0; row < n; row++) {
      for (let col = row + 1; col < n; col++) {
        const r = matrix[row][col]
        const text = isNaN(r) ? '—' : r.toFixed(2)
        // White text on strongly-coloured cells, themed text near zero
        const fontColor = isNaN(r) || Math.abs(r) <= 0.55 ? theme.tick : '#ffffff'
        const annotStyle = {
          font: { size: 9, color: fontColor, family: 'JetBrains Mono, monospace' },
          showarrow: false,
          xref: 'x',
          yref: 'y',
          text,
        }
        annotations.push({ ...annotStyle, x: labels[col], y: labels[row] })
        annotations.push({ ...annotStyle, x: labels[row], y: labels[col] })
      }
    }

    const layout = {
      margin: { t: 16, r: 64, b: 80, l: 80 },
      paper_bgcolor: theme.paper,
      plot_bgcolor: theme.paper,
      font: { family: 'Outfit, sans-serif', size: 10, color: theme.font },
      xaxis: {
        tickfont: { size: 9, color: theme.tick },
        tickangle: -45,
        automargin: true,
        side: 'bottom',
      },
      yaxis: {
        tickfont: { size: 9, color: theme.tick },
        autorange: 'reversed' as const,
        automargin: true,
      },
      annotations,
      hoverlabel: {
        bgcolor: theme.hover,
        font: { size: 11, color: theme.hoverTxt, family: 'JetBrains Mono, monospace' },
        bordercolor: theme.border,
      },
    }

    return { traces: [trace], layout }
  }, [matrix, visibleCols, theme])

  // Always keep a ref to the latest spec so the ResizeObserver can use it
  const plotSpecRef = useRef(plotSpec)
  useEffect(() => { plotSpecRef.current = plotSpec }, [plotSpec])
  const lastRenderedSpecRef = useRef<typeof plotSpec>(null)

  // Render / update when spec changes
  useEffect(() => {
    if (!plotRef.current || !plotSpec) return
    const el = plotRef.current
    const { width, height } = el.getBoundingClientRect()
    if (width === 0 || height === 0) return
    import('plotly.js').then(({ default: Plotly }) => {
      if (!plotRef.current) return
      Plotly.react(el, plotSpec.traces as Plotly.Data[], plotSpec.layout as Partial<Plotly.Layout>, PLOT_CONFIG)
      lastRenderedSpecRef.current = plotSpec
    })
  }, [plotSpec]) // eslint-disable-line react-hooks/exhaustive-deps

  // ResizeObserver — deferred draw when tab becomes visible
  useEffect(() => {
    if (!plotRef.current) return
    const el = plotRef.current
    const ro = new ResizeObserver(() => {
      if (!plotRef.current) return
      const { width, height } = plotRef.current.getBoundingClientRect()
      if (width === 0 || height === 0) return
      import('plotly.js').then(({ default: Plotly }) => {
        if (!plotRef.current) return
        const spec = plotSpecRef.current
        if (spec && spec !== lastRenderedSpecRef.current) {
          Plotly.react(
            plotRef.current,
            spec.traces as Plotly.Data[],
            spec.layout as Partial<Plotly.Layout>,
            PLOT_CONFIG,
          )
          lastRenderedSpecRef.current = spec
        } else {
          Plotly.Plots.resize(plotRef.current)
        }
      })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Purge on unmount
  useEffect(() => {
    const el = plotRef.current
    return () => {
      if (el) import('plotly.js').then(({ default: Plotly }) => Plotly.purge(el))
    }
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>

      {/* Toolbar — only shown when a matrix exists */}
      {matrix && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 10px',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}>
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--color-accent)',
            opacity: 0.8,
          }}>
            Correlation
          </span>
          <span style={{
            marginLeft: 'auto',
            fontSize: 10,
            color: 'var(--color-text-disabled)',
            fontFamily: 'JetBrains Mono, monospace',
            whiteSpace: 'nowrap',
          }}>
            {activeRows.length} rows · {visibleCols.length} metrics · Pearson r
          </span>
        </div>
      )}

      {/* Plotly canvas — always in the DOM so ResizeObserver attaches on mount */}
      <div ref={plotRef} style={{ flex: 1, minHeight: 0 }} />

      {/* Empty state overlay */}
      {!matrix && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: 24,
          textAlign: 'center',
          pointerEvents: 'none',
        }}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" style={{ opacity: 0.25 }}>
            <rect x="4"  y="4"  width="11" height="11" rx="1.5" fill="var(--color-accent)" opacity="0.9"/>
            <rect x="21" y="4"  width="11" height="11" rx="1.5" fill="var(--color-accent)" opacity="0.45"/>
            <rect x="4"  y="21" width="11" height="11" rx="1.5" fill="var(--color-accent)" opacity="0.45"/>
            <rect x="21" y="21" width="11" height="11" rx="1.5" fill="var(--color-accent)" opacity="0.9"/>
          </svg>
          <p style={{ fontSize: 12, color: 'var(--color-text-disabled)', margin: 0, lineHeight: 1.6 }}>
            {visibleCols.length < 2
              ? <>Need at least 2 visible metric columns.<br/>Show hidden metrics or calculate more.</>
              : activeRows.length < 3
                ? <>Need at least 3 structures with metrics.<br/>Load more files or relax the active filters.</>
                : 'No data to show.'}
          </p>
        </div>
      )}
    </div>
  )
}
