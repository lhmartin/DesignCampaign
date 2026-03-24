import { useEffect, useRef, useMemo, useState, type RefObject } from 'react'
import { useMetricsStore } from '@/stores/metrics-store'
import { useFileStore } from '@/stores/file-store'
import { useFilterStore, type NumericFilterRule } from '@/stores/filter-store'
import type { MolstarViewerHandle } from '@/components/viewer/MolstarViewer'
import { shortLabel } from '@/lib/metrics-labels'
import { useIsDark } from '@/hooks/useIsDark'
import { PLOTLY_DARK, PLOTLY_LIGHT } from '@/lib/constants/plotly-theme'
import { readFileContent } from '@/lib/fsa'

interface ScatterPlotProps {
  viewerRef: RefObject<MolstarViewerHandle | null>
}

type PlotType = 'scatter' | 'histogram' | 'violin' | 'ranked' | 'pareto'

// Priority-ordered default axis pairs: [xCol, yCol]
const DEFAULT_PAIRS: [string, string][] = [
  ['mean_plddt', 'rank_score'],
  ['mean_plddt', 'n_contacts'],
  ['mean_plddt', 'i_pae'],
  ['rank_score', 'n_contacts'],
]

function pickDefaults(cols: string[]): [string, string] {
  const set = new Set(cols)
  for (const [x, y] of DEFAULT_PAIRS) {
    if (set.has(x) && set.has(y)) return [x, y]
  }
  return [cols[0], cols.length > 1 ? cols[1] : cols[0]]
}

// Compute pareto front indices (non-dominated set) in O(n log n).
// Sort by X descending (for maximise.x) then sweep, tracking best Y seen.
// A point is on the front iff no prior point (better/equal X) also has better Y.
function paretoFront(
  pts: { x: number; y: number }[],
  maximise: { x: boolean; y: boolean },
): Set<number> {
  const indices = pts.map((_, i) => i).filter(i => isFinite(pts[i].x) && isFinite(pts[i].y))
  // Sort so that the "best" X comes first
  indices.sort((a, b) => maximise.x ? pts[b].x - pts[a].x : pts[a].x - pts[b].x)

  const front = new Set<number>()
  let bestY = maximise.y ? -Infinity : Infinity

  for (const i of indices) {
    const y = pts[i].y
    if (maximise.y ? y >= bestY : y <= bestY) {
      front.add(i)
      if (maximise.y ? y > bestY : y < bestY) bestY = y
    }
  }
  return front
}

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

// ── Plot type pill selector ───────────────────────────────────────────────────

const PLOT_TYPES: { value: PlotType; label: string }[] = [
  { value: 'scatter',   label: 'Scatter'   },
  { value: 'histogram', label: 'Histogram' },
  { value: 'violin',    label: 'Violin'    },
  { value: 'ranked',    label: 'Ranked'    },
  { value: 'pareto',    label: 'Pareto'    },
]

function PlotTypeSelector({ value, onChange }: { value: PlotType; onChange: (t: PlotType) => void }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {PLOT_TYPES.map(t => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          style={{
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 10,
            fontFamily: 'Outfit, sans-serif',
            cursor: 'pointer',
            border: '1px solid',
            borderColor: value === t.value ? 'var(--color-accent)' : 'var(--color-border)',
            color: value === t.value ? 'var(--color-accent)' : 'var(--color-text-secondary)',
            background: value === t.value ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'transparent',
            transition: 'all 0.1s',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── Axis select ───────────────────────────────────────────────────────────────

function AxisSelect({ value, options, onChange, label: lbl }: {
  value: string; options: string[]; onChange: (v: string) => void; label: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-accent)', opacity: 0.8 }}>
        {lbl}
      </span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          fontSize: 11, fontFamily: 'Outfit, sans-serif',
          color: 'var(--color-text-primary)', background: 'var(--color-secondary-bg)',
          border: '1px solid var(--color-border)', borderRadius: 5,
          padding: '2px 20px 2px 6px', outline: 'none', cursor: 'pointer',
          appearance: 'none', WebkitAppearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2300c8a8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 5px center',
        }}
      >
        {options.map(c => <option key={c} value={c}>{shortLabel(c)}</option>)}
      </select>
    </div>
  )
}

// ── Range limits ──────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: 60, fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
  color: 'var(--color-text-primary)', background: 'var(--color-primary-bg)',
  border: '1px solid var(--color-border)', borderRadius: 3,
  padding: '1px 4px', outline: 'none', textAlign: 'right' as const,
}

function RangeLimits({ label, isAuto, onAutoChange, min, max, onMinChange, onMaxChange }: {
  label: string; isAuto: boolean; onAutoChange: (v: boolean) => void
  min: string; max: string; onMinChange: (v: string) => void; onMaxChange: (v: string) => void
}) {
  const dimStyle: React.CSSProperties = { fontSize: 9, color: 'var(--color-text-disabled)' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>{label}</span>
      <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', userSelect: 'none' }}>
        <input type="checkbox" checked={isAuto} onChange={e => onAutoChange(e.target.checked)}
          style={{ accentColor: 'var(--color-accent)', cursor: 'pointer', width: 11, height: 11 }} />
        <span style={dimStyle}>auto</span>
      </label>
      {!isAuto && (
        <>
          <input type="number" value={min} onChange={e => onMinChange(e.target.value)} placeholder="min" style={inputStyle} />
          <span style={dimStyle}>–</span>
          <input type="number" value={max} onChange={e => onMaxChange(e.target.value)} placeholder="max" style={inputStyle} />
        </>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ScatterPlot({ viewerRef }: ScatterPlotProps) {
  const { rows, allColumns, filterText, isCalculating, progress, calculateAll } = useMetricsStore()
  const { rules: filterRules } = useFilterStore()
  const { files, setActiveFile } = useFileStore()
  const isDark = useIsDark()

  const plotRef = useRef<HTMLDivElement>(null)

  const [plotType, setPlotType] = useState<PlotType>(() => {
    const saved = localStorage.getItem('dc-plot-type')
    return (PLOT_TYPES.some(t => t.value === saved) ? saved : 'scatter') as PlotType
  })
  const [xAxis, setXAxisRaw] = useState('')
  const [yAxis, setYAxisRaw] = useState('')
  const [xAuto, setXAuto] = useState(true)
  const [yAuto, setYAuto] = useState(true)
  const [xMin, setXMin] = useState('')
  const [xMax, setXMax] = useState('')
  const [yMin, setYMin] = useState('')
  const [yMax, setYMax] = useState('')

  const prefillFromPlotly = (axis: 'x' | 'y'): [string, string] => {
    const layout = (plotRef.current as any)?._fullLayout
    const range: unknown[] | undefined = layout?.[`${axis}axis`]?.range
    if (Array.isArray(range) && range.length === 2) {
      return [String(+(range[0] as number).toPrecision(5)), String(+(range[1] as number).toPrecision(5))]
    }
    const col = axis === 'x' ? xAxis : yAxis
    const [mn, mx] = dataExtent(rows, col)
    return [String(mn), String(mx)]
  }

  const makeAutoHandler = (axis: 'x' | 'y', setAuto: (v: boolean) => void, setMin: (v: string) => void, setMax: (v: string) => void) =>
    (auto: boolean) => {
      setAuto(auto)
      if (!auto) {
        const [mn, mx] = prefillFromPlotly(axis)
        setMin(mn); setMax(mx)
      }
    }
  const handleXAuto = makeAutoHandler('x', setXAuto, setXMin, setXMax)
  const handleYAuto = makeAutoHandler('y', setYAuto, setYMin, setYMax)

  const makeAxisSetter = (setRaw: (v: string) => void, setAuto: (v: boolean) => void, setMin: (v: string) => void, setMax: (v: string) => void) =>
    (v: string) => { setRaw(v); setAuto(true); setMin(''); setMax('') }
  const setXAxis = makeAxisSetter(setXAxisRaw, setXAuto, setXMin, setXMax)
  const setYAxis = makeAxisSetter(setYAxisRaw, setYAuto, setYMin, setYMax)

  const clickDepsRef = useRef({ files, setActiveFile, viewerRef })
  useEffect(() => { clickDepsRef.current = { files, setActiveFile, viewerRef } })

  const rangeDepsRef = useRef({ xAuto, yAuto, xMin, xMax, yMin, yMax })
  useEffect(() => { rangeDepsRef.current = { xAuto, yAuto, xMin, xMax, yMin, yMax } })

  const clickHandlerRef = useRef<((e: Plotly.PlotMouseEvent) => void) | null>(null)
  const dblClickHandlerRef = useRef<(() => void) | null>(null)

  // Initialise axes with smart defaults when columns arrive
  useEffect(() => {
    if (allColumns.length === 0) return
    setXAxisRaw(prev => {
      if (prev && allColumns.includes(prev)) return prev
      return pickDefaults(allColumns)[0]
    })
    setYAxisRaw(prev => {
      if (prev && allColumns.includes(prev)) return prev
      return pickDefaults(allColumns)[1]
    })
  }, [allColumns])

  const theme = useMemo(() => isDark ? PLOTLY_DARK : PLOTLY_LIGHT, [isDark])

  // ── Filtered rows helper ──────────────────────────────────────────────────

  const { active, dimmed } = useMemo(() => {
    if (rows.length === 0) return { active: [], dimmed: [] }
    const hasFilters = !!filterText || filterRules.some(r =>
      r.type === 'residue' ? !!(r.residues?.trim()) : !!(r as NumericFilterRule).metric
    )
    if (!hasFilters) return { active: rows, dimmed: [] }
    const { passesFilters } = useFilterStore.getState()
    const act = rows.filter(r => {
      const textOk = !filterText || r.name.toLowerCase().includes(filterText.toLowerCase())
      return textOk && passesFilters(r.metrics, r.filePath)
    })
    const actSet = new Set(act)
    return { active: act, dimmed: rows.filter(r => !actSet.has(r)) }
  }, [rows, filterText, filterRules])

  // ── Plot spec ─────────────────────────────────────────────────────────────

  const plotSpec = useMemo(() => {
    if (!xAxis || !yAxis || rows.length === 0) return null

    const FILTER_LINE_COLOR = 'rgba(248,113,113,0.65)'
    const lineStyle = { color: FILTER_LINE_COLOR, width: 1.5, dash: 'dash' }
    const filterShapes: object[] = []
    for (const rule of filterRules) {
      if (rule.type !== 'numeric' || !rule.metric) continue
      if (rule.metric === xAxis) filterShapes.push({ type: 'line', x0: rule.value, x1: rule.value, yref: 'paper', y0: 0, y1: 1, line: lineStyle })
      if (rule.metric === yAxis) filterShapes.push({ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: rule.value, y1: rule.value, line: lineStyle })
    }

    const axisLayout = (titleText: string, isAuto: boolean, rangeMin: string, rangeMax: string) => {
      const mn = parseFloat(rangeMin), mx = parseFloat(rangeMax)
      const manualRange = !isAuto && !isNaN(mn) && !isNaN(mx) ? [mn, mx] : null
      return {
        title: { text: shortLabel(titleText), font: { size: 10, color: theme.font } },
        tickfont: { size: 9, color: theme.tick },
        gridcolor: theme.grid, linecolor: theme.line, zerolinecolor: theme.grid,
        automargin: true,
        ...(manualRange ? { range: manualRange, autorange: false } : { autorange: true }),
      }
    }

    const baseLayout: object = {
      margin: { t: 16, r: 16, b: 56, l: 60 },
      paper_bgcolor: theme.paper, plot_bgcolor: theme.plot,
      font: { family: 'Outfit, sans-serif', size: 10, color: theme.font },
      hoverlabel: { bgcolor: theme.hover, font: { size: 11, color: theme.hoverTxt, family: 'JetBrains Mono, monospace' }, bordercolor: theme.border },
      showlegend: false,
    }

    // ── Scatter ──────────────────────────────────────────────────────────────
    if (plotType === 'scatter') {
      const traces: object[] = []
      if (dimmed.length > 0) traces.push({
        type: 'scatter', mode: 'markers', name: 'filtered out',
        x: dimmed.map(r => r.metrics[xAxis] ?? null), y: dimmed.map(r => r.metrics[yAxis] ?? null),
        text: dimmed.map(r => r.name), customdata: dimmed.map(r => r.filePath ?? ''),
        marker: { color: theme.dim, size: 5, opacity: 0.5, line: { width: 0 } },
        hovertemplate: `<b>%{text}</b><br>${shortLabel(xAxis)}: %{x:.3f}<br>${shortLabel(yAxis)}: %{y:.3f}<extra></extra>`,
      })
      traces.push({
        type: 'scatter', mode: 'markers', name: 'structures',
        x: active.map(r => r.metrics[xAxis] ?? null), y: active.map(r => r.metrics[yAxis] ?? null),
        text: active.map(r => r.name), customdata: active.map(r => r.filePath ?? ''),
        marker: { color: theme.dot, size: 7, opacity: 0.85, line: { color: 'rgba(0,0,0,0.2)', width: 0.5 } },
        hovertemplate: `<b>%{text}</b><br>${shortLabel(xAxis)}: %{x:.3f}<br>${shortLabel(yAxis)}: %{y:.3f}<extra></extra>`,
      })
      return {
        traces, layout: {
          ...baseLayout,
          xaxis: axisLayout(xAxis, xAuto, xMin, xMax),
          yaxis: axisLayout(yAxis, yAuto, yMin, yMax),
          shapes: filterShapes,
        },
      }
    }

    // ── Pareto ───────────────────────────────────────────────────────────────
    if (plotType === 'pareto') {
      const pts = active.map(r => ({ x: r.metrics[xAxis] ?? NaN, y: r.metrics[yAxis] ?? NaN }))
      const validPts = pts.filter(p => isFinite(p.x) && isFinite(p.y))
      // Assume maximise both (pLDDT, rank_score are higher=better). User can interpret.
      const frontIndices = paretoFront(validPts, { x: true, y: true })

      const frontSet = new Set<number>()
      let vi = 0
      for (let ai = 0; ai < active.length; ai++) {
        if (isFinite(pts[ai].x) && isFinite(pts[ai].y)) {
          if (frontIndices.has(vi)) frontSet.add(ai)
          vi++
        }
      }

      const nonFront = active.filter((_, i) => !frontSet.has(i))
      const front = active.filter((_, i) => frontSet.has(i))
      // Sort front by x for the line
      const frontSorted = [...front].sort((a, b) => (a.metrics[xAxis] ?? 0) - (b.metrics[xAxis] ?? 0))

      const traces: object[] = []
      if (dimmed.length > 0) traces.push({
        type: 'scatter', mode: 'markers',
        x: dimmed.map(r => r.metrics[xAxis] ?? null), y: dimmed.map(r => r.metrics[yAxis] ?? null),
        text: dimmed.map(r => r.name), customdata: dimmed.map(r => r.filePath ?? ''),
        marker: { color: theme.dim, size: 5, opacity: 0.4, line: { width: 0 } },
        hovertemplate: `<b>%{text}</b><extra></extra>`,
      })
      traces.push({
        type: 'scatter', mode: 'markers',
        x: nonFront.map(r => r.metrics[xAxis] ?? null), y: nonFront.map(r => r.metrics[yAxis] ?? null),
        text: nonFront.map(r => r.name), customdata: nonFront.map(r => r.filePath ?? ''),
        marker: { color: theme.dot, size: 6, opacity: 0.6, line: { width: 0 } },
        hovertemplate: `<b>%{text}</b><br>${shortLabel(xAxis)}: %{x:.3f}<br>${shortLabel(yAxis)}: %{y:.3f}<extra></extra>`,
      })
      // Pareto front step-line
      traces.push({
        type: 'scatter', mode: 'lines',
        x: frontSorted.map(r => r.metrics[xAxis] ?? null),
        y: frontSorted.map(r => r.metrics[yAxis] ?? null),
        line: { color: FILTER_LINE_COLOR, width: 1.5, dash: 'dot' },
        hoverinfo: 'none',
      })
      // Pareto front points
      traces.push({
        type: 'scatter', mode: 'markers',
        x: front.map(r => r.metrics[xAxis] ?? null), y: front.map(r => r.metrics[yAxis] ?? null),
        text: front.map(r => r.name), customdata: front.map(r => r.filePath ?? ''),
        marker: { color: 'rgb(248,113,113)', size: 9, opacity: 1, line: { color: 'white', width: 1.5 } },
        hovertemplate: `<b>%{text}</b> ★<br>${shortLabel(xAxis)}: %{x:.3f}<br>${shortLabel(yAxis)}: %{y:.3f}<extra></extra>`,
      })
      return {
        traces, layout: {
          ...baseLayout,
          xaxis: axisLayout(xAxis, xAuto, xMin, xMax),
          yaxis: axisLayout(yAxis, yAuto, yMin, yMax),
          shapes: filterShapes,
        },
      }
    }

    // ── Histogram ────────────────────────────────────────────────────────────
    if (plotType === 'histogram') {
      const traces: object[] = []
      if (dimmed.length > 0) traces.push({
        type: 'histogram', name: 'filtered out',
        x: dimmed.map(r => r.metrics[xAxis] ?? null),
        marker: { color: theme.dim, opacity: 0.5 },
        hovertemplate: `${shortLabel(xAxis)}: %{x}<br>count: %{y}<extra>filtered out</extra>`,
      })
      traces.push({
        type: 'histogram', name: 'structures',
        x: active.map(r => r.metrics[xAxis] ?? null),
        marker: { color: theme.dot, opacity: 0.85, line: { color: theme.paper, width: 0.5 } },
        hovertemplate: `${shortLabel(xAxis)}: %{x}<br>count: %{y}<extra></extra>`,
      })
      const xShapes = filterShapes.filter((s: any) => s.x0 !== undefined && s.yref === 'paper')
      return {
        traces, layout: {
          ...baseLayout,
          barmode: 'overlay',
          xaxis: { ...axisLayout(xAxis, xAuto, xMin, xMax) },
          yaxis: { title: { text: 'Count', font: { size: 10, color: theme.font } }, tickfont: { size: 9, color: theme.tick }, gridcolor: theme.grid, linecolor: theme.line, automargin: true },
          shapes: xShapes,
        },
      }
    }

    // ── Violin ───────────────────────────────────────────────────────────────
    if (plotType === 'violin') {
      const traces: object[] = []
      if (dimmed.length > 0) traces.push({
        type: 'violin', name: 'filtered out',
        y: dimmed.map(r => r.metrics[yAxis] ?? null),
        box: { visible: true }, meanline: { visible: true },
        fillcolor: theme.dim, opacity: 0.4,
        line: { color: theme.dim },
        hovertemplate: `${shortLabel(yAxis)}: %{y:.3f}<extra>filtered out</extra>`,
      })
      traces.push({
        type: 'violin', name: 'structures',
        y: active.map(r => r.metrics[yAxis] ?? null),
        box: { visible: true }, meanline: { visible: true },
        fillcolor: theme.dot, opacity: 0.7,
        line: { color: theme.dot },
        hovertemplate: `${shortLabel(yAxis)}: %{y:.3f}<extra></extra>`,
      })
      const yShapes = filterShapes.filter((s: any) => s.xref === 'paper')
      return {
        traces, layout: {
          ...baseLayout,
          violinmode: 'overlay',
          xaxis: { tickfont: { size: 9, color: theme.tick }, gridcolor: theme.grid, linecolor: theme.line },
          yaxis: { ...axisLayout(yAxis, yAuto, yMin, yMax) },
          shapes: yShapes,
        },
      }
    }

    // ── Ranked ───────────────────────────────────────────────────────────────
    if (plotType === 'ranked') {
      const sorted = [...active]
        .filter(r => r.metrics[yAxis] != null && isFinite(r.metrics[yAxis]!))
        .sort((a, b) => (b.metrics[yAxis] ?? 0) - (a.metrics[yAxis] ?? 0))

      const yShapes = filterShapes.filter((s: any) => s.xref === 'paper')

      return {
        traces: [{
          type: 'bar',
          x: sorted.map((_, i) => i + 1),
          y: sorted.map(r => r.metrics[yAxis] ?? null),
          text: sorted.map(r => r.name),
          customdata: sorted.map(r => r.filePath ?? ''),
          marker: {
            color: sorted.map(r => r.metrics[yAxis] ?? 0),
            colorscale: isDark
              ? [[0, 'rgba(0,200,168,0.25)'], [1, 'rgba(0,200,168,0.9)']]
              : [[0, 'rgba(0,150,120,0.2)'], [1, 'rgba(0,150,120,0.85)']],
            showscale: false,
            line: { width: 0 },
          },
          hovertemplate: `<b>%{text}</b><br>rank: %{x}<br>${shortLabel(yAxis)}: %{y:.3f}<extra></extra>`,
        }],
        layout: {
          ...baseLayout,
          bargap: 0.1,
          xaxis: { title: { text: 'Rank', font: { size: 10, color: theme.font } }, tickfont: { size: 9, color: theme.tick }, gridcolor: theme.grid, linecolor: theme.line, automargin: true },
          yaxis: { ...axisLayout(yAxis, yAuto, yMin, yMax) },
          shapes: yShapes,
        },
      }
    }

    return null
  }, [rows, active, dimmed, xAxis, yAxis, filterRules, theme, xAuto, yAuto, xMin, xMax, yMin, yMax, plotType, isDark])

  const plotSpecRef = useRef(plotSpec)
  useEffect(() => { plotSpecRef.current = plotSpec }, [plotSpec])
  const lastRenderedSpecRef = useRef<typeof plotSpec>(null)

  const PLOT_CONFIG = { displayModeBar: false, responsive: true }

  // ── Click handler ─────────────────────────────────────────────────────────

  const attachClickHandler = (el: HTMLDivElement) => {
    const elAny = el as any
    if (!elAny.on) return
    if (clickHandlerRef.current) try { elAny.removeListener('plotly_click', clickHandlerRef.current) } catch { /* ok */ }
    const handler = (event: Plotly.PlotMouseEvent) => {
      const pt = event.points[0]
      if (!pt) return
      const filePath = (pt as any).customdata as string | undefined
      if (!filePath) return
      const { files: f, setActiveFile: saf, viewerRef: vr } = clickDepsRef.current
      const file = f.find(ff => ff.path === filePath) ?? f.find(ff => {
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

  const attachDblClickHandler = (el: HTMLDivElement) => {
    const elAny = el as any
    if (!elAny.on) return
    if (dblClickHandlerRef.current) try { elAny.removeListener('plotly_doubleclick', dblClickHandlerRef.current) } catch { /* ok */ }
    const handler = () => {
      const { xAuto: xa, yAuto: ya, xMin: xn, xMax: xx, yMin: yn, yMax: yx } = rangeDepsRef.current
      const xMn = parseFloat(xn), xMx = parseFloat(xx)
      const yMn = parseFloat(yn), yMx = parseFloat(yx)
      const hasX = !xa && !isNaN(xMn) && !isNaN(xMx)
      const hasY = !ya && !isNaN(yMn) && !isNaN(yMx)
      if (!hasX && !hasY) return
      setTimeout(() => {
        if (!plotRef.current) return
        import('plotly.js').then(({ default: Plotly }) => {
          if (!plotRef.current) return
          const update: Record<string, unknown> = {}
          if (hasX) { update['xaxis.range'] = [xMn, xMx]; update['xaxis.autorange'] = false }
          if (hasY) { update['yaxis.range'] = [yMn, yMx]; update['yaxis.autorange'] = false }
          Plotly.relayout(plotRef.current, update)
        })
      }, 0)
    }
    dblClickHandlerRef.current = handler
    elAny.on('plotly_doubleclick', handler)
  }

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
          Plotly.react(plotRef.current, spec.traces as Plotly.Data[], spec.layout as Partial<Plotly.Layout>, PLOT_CONFIG)
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

  useEffect(() => {
    const el = plotRef.current
    return () => { if (el) import('plotly.js').then(({ default: Plotly }) => Plotly.purge(el)) }
  }, [])

  // ── Calculate metrics ─────────────────────────────────────────────────────

  function handleCalculate() {
    const readFile = window.electronAPI
      ? (p: string) => window.electronAPI!.readFile(p)
      : readFileContent
    calculateAll(files, readFile)
  }

  // ── Which axis controls to show ───────────────────────────────────────────

  const showX = plotType === 'scatter' || plotType === 'pareto' || plotType === 'histogram'
  const showY = plotType === 'scatter' || plotType === 'pareto' || plotType === 'violin' || plotType === 'ranked'
  const showXRange = showX && (plotType === 'scatter' || plotType === 'pareto')
  const showYRange = showY

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>

      {/* Toolbar */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 0,
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-secondary-bg)', flexShrink: 0,
      }}>
        {/* Row 1: plot type + calculate */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px 4px', flexWrap: 'wrap' }}>
          <PlotTypeSelector value={plotType} onChange={t => { setPlotType(t); localStorage.setItem('dc-plot-type', t); setXAuto(true); setYAuto(true) }} />
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            {isCalculating && (
              <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
                {Math.round(progress * 100)}%
              </span>
            )}
            <button
              onClick={handleCalculate}
              disabled={isCalculating || files.length === 0}
              style={{
                padding: '2px 10px', borderRadius: 4, fontSize: 10,
                cursor: isCalculating || files.length === 0 ? 'default' : 'pointer',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)',
                background: 'transparent',
                opacity: files.length === 0 ? 0.4 : 1,
              }}
            >
              {isCalculating ? 'Calculating…' : 'Calculate Metrics'}
            </button>
          </div>
        </div>

        {/* Row 2: axis selectors (only when data present) */}
        {rows.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '4px 10px 5px', flexWrap: 'wrap',
            borderTop: '1px solid var(--color-border)',
          }}>
            {showX && <AxisSelect value={xAxis} options={allColumns} onChange={setXAxis} label="X" />}
            {showY && <AxisSelect value={yAxis} options={allColumns} onChange={setYAxis} label={showX ? 'Y' : 'Metric'} />}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-text-disabled)', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap' }}>
              {active.length} pts · click to load
            </span>
          </div>
        )}

        {/* Row 3: range limits (scatter / pareto / violin / ranked) */}
        {rows.length > 0 && (showXRange || showYRange) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '3px 10px 5px', flexWrap: 'wrap',
            borderTop: '1px solid var(--color-border)',
          }}>
            {showXRange && (
              <RangeLimits label="X range" isAuto={xAuto} onAutoChange={handleXAuto} min={xMin} max={xMax} onMinChange={setXMin} onMaxChange={setXMax} />
            )}
            {showXRange && showYRange && <div style={{ width: 1, height: 14, background: 'var(--color-border)', flexShrink: 0 }} />}
            {showYRange && (
              <RangeLimits label="Y range" isAuto={yAuto} onAutoChange={handleYAuto} min={yMin} max={yMax} onMinChange={setYMin} onMaxChange={setYMax} />
            )}
          </div>
        )}
      </div>

      {/* Plotly canvas */}
      <div ref={plotRef} style={{ flex: 1, minHeight: 0, cursor: rows.length > 0 ? 'crosshair' : 'default' }} />

      {/* Empty state */}
      {rows.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0, top: 80,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 10, padding: 24, textAlign: 'center', pointerEvents: 'none',
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
            No metrics loaded.<br/>Open a folder then click<br/><strong style={{ color: 'var(--color-text-secondary)' }}>Calculate Metrics</strong> above.
          </p>
        </div>
      )}
    </div>
  )
}
