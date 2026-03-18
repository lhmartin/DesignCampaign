import { useEffect, useRef, useMemo, useState, type RefObject } from 'react'
import { useMetricsStore } from '@/stores/metrics-store'
import { useFileStore } from '@/stores/file-store'
import { useFilterStore, type NumericFilterRule } from '@/stores/filter-store'
import type { MolstarViewerHandle } from '@/components/viewer/MolstarViewer'
import { shortLabel } from '@/lib/metrics-labels'

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

// Compute [min, max] extent of a column across rows, with 5% padding
function dataExtent(rows: { metrics: Record<string, number | undefined> }[], col: string): [number, number] {
  const vals: number[] = []
  for (const r of rows) {
    const v = r.metrics[col]
    if (v != null && isFinite(v)) vals.push(v)
  }
  if (vals.length === 0) return [0, 1]
  let mn = vals[0], mx = vals[0]
  for (let i = 1; i < vals.length; i++) {
    if (vals[i] < mn) mn = vals[i]
    if (vals[i] > mx) mx = vals[i]
  }
  const pad = (mx - mn) * 0.05 || 0.05
  return [+(mn - pad).toPrecision(4), +(mx + pad).toPrecision(4)]
}

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
          <option key={c} value={c}>{shortLabel(c)}</option>
        ))}
      </select>
    </div>
  )
}

// ── Axis range controls (auto toggle + min/max inputs) ────────────────────────

const inputStyle: React.CSSProperties = {
  width: 60,
  fontSize: 10,
  fontFamily: 'JetBrains Mono, monospace',
  color: 'var(--color-text-primary)',
  background: 'var(--color-primary-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 3,
  padding: '1px 4px',
  outline: 'none',
  textAlign: 'right' as const,
}

function RangeLimits({
  label, isAuto, onAutoChange, min, max, onMinChange, onMaxChange,
}: {
  label: string
  isAuto: boolean
  onAutoChange: (auto: boolean) => void
  min: string
  max: string
  onMinChange: (v: string) => void
  onMaxChange: (v: string) => void
}) {
  const labelStyle: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.10em',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
    lineHeight: 1,
  }
  const dimStyle: React.CSSProperties = {
    fontSize: 9,
    color: 'var(--color-text-disabled)',
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={labelStyle}>{label}</span>
      {/* Auto toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', userSelect: 'none' }}>
        <input
          type="checkbox"
          checked={isAuto}
          onChange={e => onAutoChange(e.target.checked)}
          style={{ accentColor: 'var(--color-accent)', cursor: 'pointer', width: 11, height: 11 }}
        />
        <span style={dimStyle}>auto</span>
      </label>
      {/* Manual range inputs */}
      {!isAuto && (
        <>
          <input
            type="number"
            value={min}
            onChange={e => onMinChange(e.target.value)}
            placeholder="min"
            style={inputStyle}
          />
          <span style={dimStyle}>–</span>
          <input
            type="number"
            value={max}
            onChange={e => onMaxChange(e.target.value)}
            placeholder="max"
            style={inputStyle}
          />
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export function ScatterPlot({ viewerRef }: ScatterPlotProps) {
  const { rows, allColumns, filterText } = useMetricsStore()
  const { rules: filterRules } = useFilterStore()
  const { files, setActiveFile } = useFileStore()
  const isDark = useIsDark()

  const plotRef = useRef<HTMLDivElement>(null)

  // ── Axis selection ──────────────────────────────────────────────────────────
  const [xAxis, setXAxisRaw] = useState('')
  const [yAxis, setYAxisRaw] = useState('')

  // ── Axis range limits ───────────────────────────────────────────────────────
  const [xAuto, setXAuto] = useState(true)
  const [yAuto, setYAuto] = useState(true)
  const [xMin, setXMin] = useState('')
  const [xMax, setXMax] = useState('')
  const [yMin, setYMin] = useState('')
  const [yMax, setYMax] = useState('')

  // When auto is toggled OFF, pre-fill from the range Plotly is currently
  // displaying (reads directly from the live figure layout so the numbers
  // match exactly what's on screen).  Falls back to computing from the data
  // if the figure hasn't been initialised yet.
  const prefillFromPlotly = (axis: 'x' | 'y'): [string, string] => {
    const layout = (plotRef.current as any)?._fullLayout
    const range: unknown[] | undefined = layout?.[`${axis}axis`]?.range
    if (Array.isArray(range) && range.length === 2) {
      return [String(+(range[0] as number).toPrecision(5)), String(+(range[1] as number).toPrecision(5))]
    }
    // Fallback: derive from data
    const col = axis === 'x' ? xAxis : yAxis
    const [mn, mx] = dataExtent(rows, col)
    return [String(mn), String(mx)]
  }

  const makeAutoHandler = (
    axis: 'x' | 'y',
    setAuto: (v: boolean) => void,
    setMin: (v: string) => void,
    setMax: (v: string) => void,
  ) => (auto: boolean) => {
    setAuto(auto)
    if (!auto) {
      const [mn, mx] = prefillFromPlotly(axis)
      setMin(mn)
      setMax(mx)
    }
  }
  const handleXAuto = makeAutoHandler('x', setXAuto, setXMin, setXMax)
  const handleYAuto = makeAutoHandler('y', setYAuto, setYMin, setYMax)

  // Reset range to auto when axis column changes
  const makeAxisSetter = (
    setAxisRaw: (v: string) => void,
    setAuto: (v: boolean) => void,
    setMin: (v: string) => void,
    setMax: (v: string) => void,
  ) => (v: string) => { setAxisRaw(v); setAuto(true); setMin(''); setMax('') }
  const setXAxis = makeAxisSetter(setXAxisRaw, setXAuto, setXMin, setXMax)
  const setYAxis = makeAxisSetter(setYAxisRaw, setYAuto, setYMin, setYMax)

  // Stable ref to click-handler dependencies
  const clickDepsRef = useRef({ files, setActiveFile, viewerRef })
  useEffect(() => { clickDepsRef.current = { files, setActiveFile, viewerRef } })

  // Stable ref to range state — kept current every render so the double-click
  // handler always has the latest values without being recreated.
  const rangeDepsRef = useRef({ xAuto, yAuto, xMin, xMax, yMin, yMax })
  useEffect(() => { rangeDepsRef.current = { xAuto, yAuto, xMin, xMax, yMin, yMax } })

  const clickHandlerRef = useRef<((e: Plotly.PlotMouseEvent) => void) | null>(null)
  const dblClickHandlerRef = useRef<(() => void) | null>(null)

  // Initialise axis defaults once when columns first arrive.
  useEffect(() => {
    if (allColumns.length === 0) return
    setXAxisRaw(prev => prev || allColumns[0])
    setYAxisRaw(prev => prev || (allColumns.length > 1 ? allColumns[1] : allColumns[0]))
  }, [allColumns])

  // Theme-aware Plotly colours
  const theme = useMemo(() => isDark
    ? {
        paper: 'transparent',
        plot:  'rgba(255,255,255,0.04)',
        grid:  'rgba(160,185,230,0.20)',
        line:  'rgba(160,185,230,0.35)',
        tick:  '#8faac8',
        font:  '#b0c8e4',
        dot:   '#00e8c0',
        dim:   'rgba(100,130,180,0.25)',
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

  // Memoize traces — recomputed when data, axes, theme, filter rules, or range limits change
  const plotSpec = useMemo(() => {
    if (!xAxis || !yAxis || rows.length === 0) return null

    const hasFilters = !!filterText || filterRules.some(r =>
      r.type === 'residue' ? !!(r.residues?.trim()) : !!(r as NumericFilterRule).metric
    )

    const { passesFilters } = useFilterStore.getState()
    const active = hasFilters
      ? rows.filter(r => {
          const textOk = !filterText || r.name.toLowerCase().includes(filterText.toLowerCase())
          return textOk && passesFilters(r.metrics, r.filePath)
        })
      : rows
    const activeSet = new Set(active)
    const dimmed = hasFilters ? rows.filter(r => !activeSet.has(r)) : []

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

    // ── Filter cutoff lines ──────────────────────────────────────────────────
    const shapes: object[] = []
    const lineStyle = { color: 'rgba(248,113,113,0.65)', width: 1.5, dash: 'dash' }
    for (const rule of filterRules) {
      if (rule.type !== 'numeric' || !rule.metric) continue
      if (rule.metric === xAxis) {
        shapes.push({
          type: 'line',
          x0: rule.value, x1: rule.value,
          yref: 'paper', y0: 0, y1: 1,
          line: lineStyle,
        })
      }
      if (rule.metric === yAxis) {
        shapes.push({
          type: 'line',
          xref: 'paper', x0: 0, x1: 1,
          y0: rule.value, y1: rule.value,
          line: lineStyle,
        })
      }
    }

    // ── Axis layout helper ──────────────────────────────────────────────────
    const axisLayout = (
      titleText: string,
      isAuto: boolean,
      rangeMin: string,
      rangeMax: string,
    ) => {
      const mn = parseFloat(rangeMin)
      const mx = parseFloat(rangeMax)
      const manualRange = !isAuto && !isNaN(mn) && !isNaN(mx) ? [mn, mx] : null
      return {
        title: { text: shortLabel(titleText), font: { size: 10, color: theme.font } },
        tickfont: { size: 9, color: theme.tick },
        gridcolor: theme.grid,
        linecolor: theme.line,
        zerolinecolor: theme.grid,
        automargin: true,
        ...(manualRange
          ? { range: manualRange, autorange: false }
          : { autorange: true }),
      }
    }

    const layout: object = {
      xaxis: axisLayout(xAxis, xAuto, xMin, xMax),
      yaxis: axisLayout(yAxis, yAuto, yMin, yMax),
      shapes,
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
  }, [rows, xAxis, yAxis, filterText, filterRules, theme, xAuto, yAuto, xMin, xMax, yMin, yMax])

  // Always keep a ref to the latest plotSpec
  const plotSpecRef = useRef(plotSpec)
  useEffect(() => { plotSpecRef.current = plotSpec }, [plotSpec])

  const lastRenderedSpecRef = useRef<typeof plotSpec>(null)

  const PLOT_CONFIG = { displayModeBar: false, responsive: true }

  // ── Click-handler helper ──────────────────────────────────────────────────
  const attachClickHandler = (el: HTMLDivElement) => {
    const elAny = el as any
    if (!elAny.on) return

    if (clickHandlerRef.current) {
      try { elAny.removeListener('plotly_click', clickHandlerRef.current) } catch { /* ok */ }
    }

    const handler = (event: Plotly.PlotMouseEvent) => {
      const pt = event.points[0]
      if (!pt) return
      const filePath = (pt as any).customdata as string | undefined
      if (!filePath) return

      const { files: f, setActiveFile: saf, viewerRef: vr } = clickDepsRef.current

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

  // Double-click resets zoom — when in manual mode, re-apply the stored ranges
  // instead of letting Plotly snap back to autorange.
  const attachDblClickHandler = (el: HTMLDivElement) => {
    const elAny = el as any
    if (!elAny.on) return

    if (dblClickHandlerRef.current) {
      try { elAny.removeListener('plotly_doubleclick', dblClickHandlerRef.current) } catch { /* ok */ }
    }

    const handler = () => {
      const { xAuto: xa, yAuto: ya, xMin: xn, xMax: xx, yMin: yn, yMax: yx } = rangeDepsRef.current
      const xMn = parseFloat(xn), xMx = parseFloat(xx)
      const yMn = parseFloat(yn), yMx = parseFloat(yx)
      const hasX = !xa && !isNaN(xMn) && !isNaN(xMx)
      const hasY = !ya && !isNaN(yMn) && !isNaN(yMx)
      if (!hasX && !hasY) return   // both auto — let Plotly handle it normally

      // Prevent Plotly's default double-click reset by immediately relayouting
      // with the manual range(s) after a microtask (Plotly fires its reset async).
      setTimeout(() => {
        if (!plotRef.current) return
        import('plotly.js').then(({ default: Plotly }) => {
          if (!plotRef.current) return
          const update: Record<string, unknown> = {}
          if (hasX) { update['xaxis.range']     = [xMn, xMx]; update['xaxis.autorange'] = false }
          if (hasY) { update['yaxis.range']     = [yMn, yMx]; update['yaxis.autorange'] = false }
          Plotly.relayout(plotRef.current, update)
        })
      }, 0)
    }

    dblClickHandlerRef.current = handler
    elAny.on('plotly_doubleclick', handler)
  }

  // Render / update the plot
  useEffect(() => {
    if (!plotRef.current || !plotSpec) return
    const el = plotRef.current
    const { width, height } = el.getBoundingClientRect()
    if (width === 0 || height === 0) return
    import('plotly.js').then(({ default: Plotly }) => {
      if (!plotRef.current) return
      Plotly.react(el, plotSpec.traces as Plotly.Data[], plotSpec.layout as Partial<Plotly.Layout>, PLOT_CONFIG)
      lastRenderedSpecRef.current = plotSpec
      attachClickHandler(el)
      attachDblClickHandler(el)
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
          attachClickHandler(plotRef.current)
          attachDblClickHandler(plotRef.current)
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

      {/* Toolbar — only visible when data is present */}
      {rows.length > 0 && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-secondary-bg)',
          flexShrink: 0,
        }}>
          {/* Row 1: axis selectors + point count */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '6px 10px 4px',
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

          {/* Row 2: axis range limits */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '3px 10px 6px',
            flexWrap: 'wrap',
            borderTop: '1px solid var(--color-border)',
          }}>
            <RangeLimits
              label="X range"
              isAuto={xAuto}
              onAutoChange={handleXAuto}
              min={xMin}
              max={xMax}
              onMinChange={setXMin}
              onMaxChange={setXMax}
            />
            <div style={{ width: 1, height: 14, background: 'var(--color-border)', flexShrink: 0 }} />
            <RangeLimits
              label="Y range"
              isAuto={yAuto}
              onAutoChange={handleYAuto}
              min={yMin}
              max={yMax}
              onMinChange={setYMin}
              onMaxChange={setYMax}
            />
          </div>
        </div>
      )}

      {/* Plotly canvas – always in the DOM so ResizeObserver attaches on mount */}
      <div
        ref={plotRef}
        style={{ flex: 1, minHeight: 0, cursor: rows.length > 0 ? 'crosshair' : 'default' }}
      />

      {/* Empty-state overlay */}
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
