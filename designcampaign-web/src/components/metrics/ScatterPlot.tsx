import { useEffect, useRef, useMemo, useState, type RefObject } from 'react'
import { useMetricsStore } from '@/stores/metrics-store'
import { useFileStore } from '@/stores/file-store'
import type { MolstarViewerHandle } from '@/components/viewer/MolstarViewer'

interface ScatterPlotProps {
  viewerRef: RefObject<MolstarViewerHandle | null>
}

// Read theme once and subscribe to class changes on <html>
function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  )
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark'))
    )
    obs.observe(document.documentElement, { attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return isDark
}

const LABELS: Record<string, string> = {
  mean_plddt: 'pLDDT',
  mean_bfactor: 'B-factor',
  num_residues: 'Residues',
  chain_count: 'Chains',
}
const label = (c: string) => LABELS[c] ?? c.split('.').pop() ?? c

// ── Styled select for the axis choosers ──────────────────────────────────────

function AxisSelect({
  value, options, onChange, label: lbl,
}: {
  value: string
  options: string[]
  onChange: (v: string) => void
  label: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--color-accent)',
        opacity: 0.8,
        lineHeight: 1,
      }}>
        {lbl}
      </span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          fontSize: 11,
          fontFamily: 'Outfit, sans-serif',
          color: 'var(--color-text-primary)',
          background: 'var(--color-secondary-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 5,
          padding: '2px 20px 2px 6px',
          outline: 'none',
          cursor: 'pointer',
          appearance: 'none',
          WebkitAppearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2300c8a8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 5px center',
        }}
      >
        {options.map(c => (
          <option key={c} value={c}>{label(c)}</option>
        ))}
      </select>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export function ScatterPlot({ viewerRef }: ScatterPlotProps) {
  const { rows, allColumns, filterText } = useMetricsStore()
  const { files, setActiveFile } = useFileStore()
  const isDark = useIsDark()

  const plotRef = useRef<HTMLDivElement>(null)
  const [xAxis, setXAxis] = useState('')
  const [yAxis, setYAxis] = useState('')

  // Stable ref to click-handler dependencies (files, setActiveFile, viewerRef).
  // Kept up-to-date every render so the handler never closes over stale values.
  const clickDepsRef = useRef({ files, setActiveFile, viewerRef })
  useEffect(() => { clickDepsRef.current = { files, setActiveFile, viewerRef } })

  // Ref to the currently registered plotly_click handler so we can remove it
  // before re-registering on the next Plotly.react() call.
  const clickHandlerRef = useRef<((e: Plotly.PlotMouseEvent) => void) | null>(null)

  // Initialise axis defaults once when columns first arrive.
  // Uses functional setState so we never overwrite a value the user has already
  // chosen, and we DON'T include xAxis/yAxis in the dep array (avoids the
  // strict-mode double-invoke setting both axes to the second column).
  useEffect(() => {
    if (allColumns.length === 0) return
    setXAxis(prev => prev || allColumns[0])
    setYAxis(prev => prev || (allColumns.length > 1 ? allColumns[1] : allColumns[0]))
  }, [allColumns])

  // Theme-aware Plotly colours
  const theme = useMemo(() => isDark
    ? {
        paper: 'transparent',
        plot:  'rgba(255,255,255,0.04)',   // faint white tint — separates plot from panel bg
        grid:  'rgba(160,185,230,0.20)',   // visible but subtle grid lines
        line:  'rgba(160,185,230,0.35)',   // axis spine lines
        tick:  '#8faac8',                  // solid mid-blue-gray tick labels
        font:  '#b0c8e4',                  // axis title text
        dot:   '#00e8c0',                  // brighter teal for better contrast
        dim:   'rgba(100,130,180,0.25)',   // filtered-out dots
        hover: 'rgba(18,24,52,0.96)',
        hoverTxt: '#c4d4ec',
        border: 'rgba(0,220,180,0.35)',
      }
    : {
        paper: 'transparent',
        plot:  'rgba(242,245,251,0.0)',
        grid:  'rgba(208,216,236,0.9)',
        line:  'rgba(208,216,236,1)',
        tick:  '#4a607c',
        font:  '#4a607c',
        dot:   '#0068c8',
        dim:   'rgba(208,216,236,0.6)',
        hover: '#ffffff',
        hoverTxt: '#111827',
        border: 'rgba(0,104,200,0.25)',
      },
  [isDark])

  // Memoize traces — only recomputed when data, axes, or theme change
  const plotSpec = useMemo(() => {
    if (!xAxis || !yAxis || rows.length === 0) return null

    const filtered = filterText
      ? new Set(rows.filter(r => r.name.toLowerCase().includes(filterText.toLowerCase())).map(r => r.name))
      : null

    const active  = filtered ? rows.filter(r => filtered.has(r.name))  : rows
    const dimmed  = filtered ? rows.filter(r => !filtered.has(r.name)) : []

    const traces: object[] = []

    if (dimmed.length > 0) {
      traces.push({
        type: 'scatter', mode: 'markers', name: 'filtered out',
        x: dimmed.map(r => r.metrics[xAxis] ?? null),
        y: dimmed.map(r => r.metrics[yAxis] ?? null),
        text: dimmed.map(r => r.name),
        customdata: dimmed.map(r => r.filePath ?? ''),
        marker: { color: theme.dim, size: 5, opacity: 0.5, line: { width: 0 } },
        hovertemplate: `<b>%{text}</b><br>${xAxis}: %{x:.3f}<br>${yAxis}: %{y:.3f}<extra></extra>`,
      })
    }

    traces.push({
      type: 'scatter', mode: 'markers', name: 'structures',
      x: active.map(r => r.metrics[xAxis] ?? null),
      y: active.map(r => r.metrics[yAxis] ?? null),
      text: active.map(r => r.name),
      customdata: active.map(r => r.filePath ?? ''),
      marker: {
        color: theme.dot,
        size: 7,
        opacity: 0.85,
        line: { color: 'rgba(0,0,0,0.2)', width: 0.5 },
      },
      hovertemplate: `<b>%{text}</b><br>${xAxis}: %{x:.3f}<br>${yAxis}: %{y:.3f}<extra></extra>`,
    })

    const axis = (titleText: string) => ({
      title: { text: label(titleText), font: { size: 10, color: theme.font } },
      tickfont: { size: 9, color: theme.tick },
      gridcolor: theme.grid,
      linecolor: theme.line,
      zerolinecolor: theme.grid,
      automargin: true,
      autorange: true,
    })

    const layout: object = {
      xaxis: axis(xAxis),
      yaxis: axis(yAxis),
      margin: { t: 16, r: 16, b: 56, l: 60 },
      showlegend: false,
      paper_bgcolor: theme.paper,
      plot_bgcolor: theme.plot,
      font: { family: 'Outfit, sans-serif', size: 10, color: theme.font },
      hoverlabel: {
        bgcolor: theme.hover,
        font: { size: 11, color: theme.hoverTxt, family: 'JetBrains Mono, monospace' },
        bordercolor: theme.border,
      },
    }

    return { traces, layout }
  }, [rows, xAxis, yAxis, filterText, theme])

  // Always keep a ref to the latest plotSpec so the ResizeObserver can access it
  // without being recreated every time the spec changes.
  const plotSpecRef = useRef(plotSpec)
  useEffect(() => { plotSpecRef.current = plotSpec }, [plotSpec])

  // Tracks the spec that was last successfully rendered to a *visible* container.
  // Only updated when Plotly.react() runs with non-zero dimensions, so the
  // ResizeObserver can tell whether the current spec still needs a full re-draw.
  const lastRenderedSpecRef = useRef<typeof plotSpec>(null)

  const PLOT_CONFIG = { displayModeBar: false, responsive: true }

  // ── Click-handler helper ─────────────────────────────────────────────────
  // Called after every Plotly.react() — removes any previous handler then
  // attaches a fresh one.  Using clickHandlerRef avoids stale closures and
  // duplicate firings.
  const attachClickHandler = (el: HTMLDivElement) => {
    const elAny = el as any
    if (!elAny.on) return                        // Plotly not yet initialised

    // Remove the previous handler before re-adding
    if (clickHandlerRef.current) {
      try { elAny.removeListener('plotly_click', clickHandlerRef.current) } catch { /* ok */ }
    }

    const handler = (event: Plotly.PlotMouseEvent) => {
      const pt = event.points[0]
      if (!pt) return
      const filePath = (pt as any).customdata as string | undefined
      if (!filePath) return

      const { files: f, setActiveFile: saf, viewerRef: vr } = clickDepsRef.current

      // Try exact path match, then stem match (in case customdata has no extension)
      const file =
        f.find(ff => ff.path === filePath) ??
        f.find(ff => {
          const stem = ff.name.replace(/\.[^.]+$/, '')
          return stem === filePath || ff.path.endsWith(filePath)
        })

      if (!file) return
      saf(file.path)
      vr.current?.loadFromFile(file.path)
    }

    clickHandlerRef.current = handler
    elAny.on('plotly_click', handler)
  }

  // Render / update the plot — skips if the container is hidden (0×0) so that
  // Plotly doesn't stamp .data on an invisible element and fool the ResizeObserver.
  // The ResizeObserver handles the deferred full draw when the tab becomes visible.
  useEffect(() => {
    if (!plotRef.current || !plotSpec) return
    const el = plotRef.current
    const { width, height } = el.getBoundingClientRect()
    if (width === 0 || height === 0) return          // tab hidden — defer to ResizeObserver
    import('plotly.js').then(({ default: Plotly }) => {
      if (!plotRef.current) return
      Plotly.react(el, plotSpec.traces as Plotly.Data[], plotSpec.layout as Partial<Plotly.Layout>, PLOT_CONFIG)
      lastRenderedSpecRef.current = plotSpec
      attachClickHandler(el)
    })
  }, [plotSpec]) // eslint-disable-line react-hooks/exhaustive-deps

  // ResizeObserver — fires when the container gains non-zero size (tab becomes visible).
  // If the current plotSpec hasn't been rendered yet (was hidden when data arrived),
  // do a full Plotly.react(); otherwise just resize the existing plot.
  useEffect(() => {
    if (!plotRef.current) return
    const el = plotRef.current
    const ro = new ResizeObserver(() => {
      if (!plotRef.current) return
      const { width, height } = plotRef.current.getBoundingClientRect()
      if (width === 0 || height === 0) return            // still hidden — skip

      import('plotly.js').then(({ default: Plotly }) => {
        if (!plotRef.current) return
        const spec = plotSpecRef.current
        if (spec && spec !== lastRenderedSpecRef.current) {
          // New data arrived while the tab was hidden — do a full re-draw now
          Plotly.react(
            plotRef.current,
            spec.traces as Plotly.Data[],
            spec.layout as Partial<Plotly.Layout>,
            PLOT_CONFIG,
          )
          lastRenderedSpecRef.current = spec
          attachClickHandler(plotRef.current)
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

  // ── Render ───────────────────────────────────────────────────────────────────
  // IMPORTANT: plotRef must ALWAYS be in the DOM from first mount so the
  // [] ResizeObserver effect can attach to it. When there are no rows we
  // overlay the empty-state on top instead of returning early.

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>

      {/* Axis selector bar – only visible when data is present */}
      {rows.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '6px 10px',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-secondary-bg)',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}>
          <AxisSelect value={xAxis} options={allColumns} onChange={setXAxis} label="X" />
          <AxisSelect value={yAxis} options={allColumns} onChange={setYAxis} label="Y" />
          <span style={{
            marginLeft: 'auto',
            fontSize: 10,
            color: 'var(--color-text-disabled)',
            fontFamily: 'JetBrains Mono, monospace',
            whiteSpace: 'nowrap',
          }}>
            {rows.length} pts · click to load
          </span>
        </div>
      )}

      {/* Plotly canvas – always in the DOM so ResizeObserver attaches on mount */}
      <div
        ref={plotRef}
        style={{ flex: 1, minHeight: 0, cursor: rows.length > 0 ? 'crosshair' : 'default' }}
      />

      {/* Empty-state overlay – shown when no data, lives above the plot div */}
      {rows.length === 0 && (
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
            <circle cx="10" cy="26" r="3" fill="var(--color-accent)"/>
            <circle cx="18" cy="16" r="3" fill="var(--color-accent)"/>
            <circle cx="26" cy="20" r="3" fill="var(--color-accent)"/>
            <circle cx="14" cy="10" r="3" fill="var(--color-accent)"/>
            <line x1="4" y1="32" x2="32" y2="32" stroke="var(--color-border)" strokeWidth="1.5"/>
            <line x1="4" y1="32" x2="4" y2="4" stroke="var(--color-border)" strokeWidth="1.5"/>
          </svg>
          <p style={{ fontSize: 12, color: 'var(--color-text-disabled)', margin: 0, lineHeight: 1.5 }}>
            No metrics loaded.<br/>
            Open a folder and calculate<br/>metrics from the Metrics tab.
          </p>
        </div>
      )}
    </div>
  )
}
