import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import type { ChainSequence } from '@/lib/sequence'
import { residueColor, HYDROPHOBICITY_SCALE } from '@/lib/sequence'
import { lerpColor } from '@/lib/constants/colors'
import { useSelectionStore } from '@/stores/selection-store'
import { syncToMolstar } from '@/lib/mol-selection-sync'
import { useAntpackStore, CDR_CONFIDENCE_THRESHOLDS } from '@/stores/antpack-store'
import type { CdrRegionName, CdrConfidenceFilter } from '@/stores/antpack-store'
import { useRmsdStore } from '@/stores/rmsd-store'
import { useNamedSelectionStore } from '@/stores/named-selection-store'

type PluginUIContext = import('molstar/lib/mol-plugin-ui/context').PluginUIContext

// ─── Layout constants ─────────────────────────────────────────────────────────
const CELL_W       = 10   // px per residue cell
const NUM_H        = 11   // px for residue-number annotation row
const AA_H         = 17   // px for amino-acid cell row
const ANNOT_H      = 13   // px for CDR/FW region annotation track
const ROW_H        = NUM_H + AA_H   // 28 px per wrapped row
const CHUNK        = 8    // residues per chunk
const CHUNK_GAP    = 2    // px gap between chunks
const ROW_GAP      = 1    // px gap between wrapped rows
const MAX_ROWS     = 6    // max visible rows before vertical scroll
const CONTROLS_W   = 90   // px width of left colour-mode controls
const CHAIN_PILL_W = 36   // px width reserved for chain label

// ─── Color mode ───────────────────────────────────────────────────────────────
type ColorMode = 'none' | 'chemical' | 'hydrophobicity' | 'plddt' | 'rmsd'

// ─── CDR annotation track colors ──────────────────────────────────────────────
const REGION_COLORS: Record<CdrRegionName, { bg: string; fg: string }> = {
  CDR1: { bg: 'rgba(239,68,68,0.65)',   fg: '#ffffff' },
  CDR2: { bg: 'rgba(249,115,22,0.65)',  fg: '#ffffff' },
  CDR3: { bg: 'rgba(234,179,8,0.65)',   fg: '#0a0e1a' },
  FW1:  { bg: 'rgba(100,120,160,0.18)', fg: 'var(--color-text-disabled)' },
  FW2:  { bg: 'rgba(100,120,160,0.18)', fg: 'var(--color-text-disabled)' },
  FW3:  { bg: 'rgba(100,120,160,0.18)', fg: 'var(--color-text-disabled)' },
  FW4:  { bg: 'rgba(100,120,160,0.18)', fg: 'var(--color-text-disabled)' },
}

// ─── CDR span helpers ─────────────────────────────────────────────────────────

interface CdrSpan {
  region: CdrRegionName
  startIdx: number  // inclusive, 0-indexed into chain residues
  endIdx:   number  // inclusive
}

/** Group consecutive same-region assignments into contiguous spans. */
function buildCdrSpans(assignments: (CdrRegionName | null)[]): CdrSpan[] {
  const spans: CdrSpan[] = []
  let cur: CdrSpan | null = null
  for (let i = 0; i < assignments.length; i++) {
    const r = assignments[i]
    if (r === null) {
      if (cur) { spans.push(cur); cur = null }
    } else if (cur && cur.region === r) {
      cur.endIdx = i
    } else {
      if (cur) spans.push(cur)
      cur = { region: r, startIdx: i, endIdx: i }
    }
  }
  if (cur) spans.push(cur)
  return spans
}

/** Left-edge pixel of residue i within a display row, accounting for chunk gaps. */
function resX(i: number): number {
  return i * CELL_W + Math.floor(i / CHUNK) * CHUNK_GAP
}

// ─── Annotation track component ───────────────────────────────────────────────

const AnnotationTrack = React.memo(function AnnotationTrack({
  rowStartIdx, rowLength, spans,
}: {
  rowStartIdx: number
  rowLength:   number
  spans:       CdrSpan[]
}) {
  const rowEndIdx = rowStartIdx + rowLength - 1
  const trackW    = resX(rowLength - 1) + CELL_W

  const visible = spans
    .filter(s => s.endIdx >= rowStartIdx && s.startIdx <= rowEndIdx)
    .map(s => ({
      region: s.region,
      lo: Math.max(s.startIdx, rowStartIdx) - rowStartIdx,
      hi: Math.min(s.endIdx,   rowEndIdx)   - rowStartIdx,
    }))

  return (
    <div style={{ position: 'relative', height: ANNOT_H, width: trackW, flexShrink: 0 }}>
      {visible.map(({ region, lo, hi }, i) => {
        const x = resX(lo)
        const w = resX(hi) + CELL_W - x
        const { bg, fg } = REGION_COLORS[region]
        return (
          <div key={i} style={{
            position: 'absolute',
            left: x, top: 2,
            width: w, height: ANNOT_H - 4,
            background: bg,
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {w >= 22 && (
              <span style={{
                fontSize: 7, fontWeight: 700,
                color: fg,
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}>
                {region}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
})

// ─── Color legend ─────────────────────────────────────────────────────────────
function Swatch({ bg, label }: { bg: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 9, height: 9, borderRadius: 2, background: bg, flexShrink: 0, border: '1px solid rgba(128,128,128,0.15)' }} />
      <span style={{ fontSize: 9.5, color: 'var(--color-text-secondary)', lineHeight: 1, whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  )
}

function ColorLegend({ mode }: { mode: ColorMode }) {
  if (mode === 'none') return null

  if (mode === 'chemical') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 5 }}>
      <Swatch bg="rgba(255,155,60,0.85)"  label="Nonpolar" />
      <Swatch bg="rgba(72,200,110,0.85)"  label="Polar" />
      <Swatch bg="rgba(80,140,255,0.85)"  label="+Charged" />
      <Swatch bg="rgba(255,80,80,0.85)"   label="−Charged" />
      <Swatch bg="rgba(160,160,180,0.85)" label="Gly" />
    </div>
  )

  if (mode === 'hydrophobicity') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 5 }}>
      <div style={{ height: 9, borderRadius: 2, background: 'linear-gradient(to right, #3b82f6, #f97316)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 8.5, color: 'var(--color-text-secondary)', lineHeight: 1 }}>Philic</span>
        <span style={{ fontSize: 8.5, color: 'var(--color-text-secondary)', lineHeight: 1 }}>Phobic</span>
      </div>
    </div>
  )

  if (mode === 'rmsd') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 5 }}>
      <div style={{ height: 9, borderRadius: 2, background: 'linear-gradient(to right, rgba(255,255,255,0.25), #f97316, #ef4444)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 8.5, color: 'var(--color-text-secondary)', lineHeight: 1 }}>0 Å</span>
        <span style={{ fontSize: 8.5, color: 'var(--color-text-secondary)', lineHeight: 1 }}>≥3 Å</span>
      </div>
    </div>
  )

  // plddt
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 5 }}>
      <Swatch bg="#0053d6" label=">90 V.High" />
      <Swatch bg="#65cbf3" label=">70 Confid" />
      <Swatch bg="#ffdb13" label=">50 Low" />
      <Swatch bg="#ff7d45" label="≤50 V.Low" />
    </div>
  )
}

// ─── Color helpers ────────────────────────────────────────────────────────────
function hydroColor(code: string): { bg: string; fg: string } {
  const h = HYDROPHOBICITY_SCALE[code] ?? 0
  const t = Math.max(0, Math.min(1, (h + 4.5) / 9))
  // #3b82f6 (blue) → #f97316 (orange)
  return { bg: lerpColor(t, [59, 130, 246], [249, 115, 22]), fg: '#ffffff' }
}

/** deviation (Å) → background colour on white → orange → red ramp, saturating at 3 Å. */
function rmsdColor(dev: number | undefined): { bg: string; fg: string } {
  if (dev === undefined) return { bg: 'rgba(120,120,140,0.10)', fg: 'var(--color-text-disabled)' }
  const t = Math.min(1, dev / 3)
  if (t < 0.01) return { bg: 'rgba(255,255,255,0.20)', fg: 'var(--color-text-primary)' }
  const r = t <= 0.5
    ? lerpColor(t * 2,       [255, 255, 255], [249, 115,  22])
    : lerpColor((t - 0.5) * 2, [249, 115,  22], [239,  68,  68])
  return { bg: r, fg: t > 0.6 ? '#ffffff' : '#0a0e1a' }
}

function plddtColor(value: number | undefined): { bg: string; fg: string } {
  if (value === undefined) return { bg: 'rgba(120,120,140,0.25)', fg: '#888898' }
  if (value > 90) return { bg: '#0053d6', fg: '#ffffff' }
  if (value > 70) return { bg: '#65cbf3', fg: '#0a0e1a' }
  if (value > 50) return { bg: '#ffdb13', fg: '#0a0e1a' }
  return { bg: '#ff7d45', fg: '#ffffff' }
}

// ─── Range helpers ────────────────────────────────────────────────────────────
type Pos = { chainIdx: number; resIdx: number }

function flatOrd(chains: ChainSequence[], pos: Pos): number {
  let n = 0
  for (let ci = 0; ci < pos.chainIdx; ci++) n += chains[ci].residues.length
  return n + pos.resIdx
}

function keysInRange(chains: ChainSequence[], a: Pos, b: Pos): string[] {
  const [start, end] = flatOrd(chains, a) <= flatOrd(chains, b) ? [a, b] : [b, a]
  const keys: string[] = []
  for (let ci = start.chainIdx; ci <= end.chainIdx; ci++) {
    const rStart = ci === start.chainIdx ? start.resIdx : 0
    const rEnd   = ci === end.chainIdx   ? end.resIdx   : chains[ci].residues.length - 1
    for (let ri = rStart; ri <= rEnd; ri++) {
      keys.push(`${chains[ci].chain}:${chains[ci].residues[ri].number}`)
    }
  }
  return keys
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface SequenceViewerProps {
  chains: ChainSequence[]
  plugin: PluginUIContext | null
  residueValues?: Map<string, number>
  /** File path of the currently loaded structure — used to key CDR annotations. */
  structurePath?: string
}

// ─── Component ───────────────────────────────────────────────────────────────
export function SequenceViewer({ chains, plugin, residueValues, structurePath }: SequenceViewerProps) {
  const { selectedResidues, addResidue, clearSelection, selectAll } = useSelectionStore()
  const cdrAnnotations         = useAntpackStore(s => structurePath ? s.annotations.get(structurePath) : undefined)
  const cdrConfidenceFilter    = useAntpackStore(s => s.cdrConfidenceFilter)
  const setCdrConfidenceFilter = useAntpackStore(s => s.setCdrConfidenceFilter)
  const rmsdDeviations         = useRmsdStore(s => structurePath ? s.deviationsByPath.get(structurePath) : undefined)
  const hasRmsd                = !!rmsdDeviations
  const allNamedSelections     = useNamedSelectionStore(s => s.selections)
  const namedSelColorMap       = useMemo(() => {
    const map = new Map<string, number>()
    for (const sel of allNamedSelections) {
      if (!sel.visible) continue
      for (const key of sel.residues) map.set(key, sel.color)
    }
    return map
  }, [allNamedSelections])

  const [colorMode, setColorMode]       = useState<ColorMode>('chemical')
  const [hoveredKey, setHoveredKey]     = useState<string | null>(null)
  const [anchor, setAnchor]             = useState<Pos | null>(null)
  const [dragEnd, setDragEnd]           = useState<Pos | null>(null)
  const mouseDownRef                    = useRef(false)
  const containerRef                    = useRef<HTMLDivElement>(null)
  const contentRef                      = useRef<HTMLDivElement>(null)
  const [contentWidth, setContentWidth] = useState(600)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = Math.round(entries[0].contentRect.width)
      setContentWidth(prev => prev === w ? prev : w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const residuesPerRow = useMemo(() => {
    const usable = contentWidth - CHAIN_PILL_W - 32
    return Math.max(CHUNK, Math.floor(usable / (CELL_W + CHUNK_GAP / CHUNK)))
  }, [contentWidth])

  const dragKeys = useMemo<Set<string>>(() => {
    if (!anchor || !dragEnd) return new Set()
    return new Set(keysInRange(chains, anchor, dragEnd))
  }, [chains, anchor, dragEnd])

  const displayRows = useMemo(() =>
    chains.flatMap((chain, ci) => {
      const totalRows = Math.ceil(chain.residues.length / residuesPerRow)
      return Array.from({ length: totalRows }, (_, rowIdx) => ({
        chain,
        chainIdx:    ci,
        rowIdx,
        isFirstRow:  rowIdx === 0,
        isLastChain: ci === chains.length - 1,
        rowStartIdx: rowIdx * residuesPerRow,
        residues:    chain.residues.slice(rowIdx * residuesPerRow, (rowIdx + 1) * residuesPerRow),
      }))
    })
  , [chains, residuesPerRow])

  // Pre-build span lists per chain — filtered by confidence threshold
  const spansByChain = useMemo(() => {
    if (!cdrAnnotations) return null
    const minPct = CDR_CONFIDENCE_THRESHOLDS[cdrConfidenceFilter]
    const map = new Map<string, CdrSpan[]>()
    for (const ann of cdrAnnotations) {
      if (ann.percentIdentity < minPct) continue
      map.set(ann.chain, buildCdrSpans(ann.assignments))
    }
    return map.size > 0 ? map : null
  }, [cdrAnnotations, cdrConfidenceFilter])

  // Expand viewer height to accommodate annotation tracks when present
  const maxStripH = useMemo(() => {
    const extraH = spansByChain ? ANNOT_H : 0
    return MAX_ROWS * (ROW_H + extraH) + (MAX_ROWS - 1) * ROW_GAP + 12
  }, [spansByChain])

  if (chains.length === 0) return null

  // ── Cell color by mode ──────────────────────────────────────────────────────
  const cellColors = useCallback((code: string, key: string, _chainId: string, _resIdx: number): { bg: string; fg: string } => {
    if (colorMode === 'none')           return { bg: 'rgba(120,120,140,0.10)', fg: 'var(--color-text-disabled)' }
    if (colorMode === 'hydrophobicity') return hydroColor(code)
    if (colorMode === 'plddt')          return plddtColor(residueValues?.get(key))
    if (colorMode === 'rmsd')           return rmsdColor(rmsdDeviations?.get(key))
    return residueColor(code)
  }, [colorMode, residueValues, rmsdDeviations])

  // ── Event handlers ──────────────────────────────────────────────────────────
  function handleCellMouseDown(
    e: React.MouseEvent, chainIdx: number, resIdx: number, chainId: string, resId: number,
  ) {
    e.preventDefault()
    mouseDownRef.current = true

    if (e.ctrlKey || e.metaKey) {
      if (anchor) {
        const keys = keysInRange(chains, anchor, { chainIdx, resIdx })
        selectAll(keys)
        syncToMolstar(plugin, keys)
      } else {
        clearSelection()
        addResidue(chainId, resId)
        setAnchor({ chainIdx, resIdx })
        syncToMolstar(plugin, [`${chainId}:${resId}`])
      }
      return
    }

    clearSelection()
    addResidue(chainId, resId)
    setAnchor({ chainIdx, resIdx })
    setDragEnd({ chainIdx, resIdx })
    syncToMolstar(plugin, [`${chainId}:${resId}`])
  }

  function handleCellMouseEnter(
    e: React.MouseEvent, chainIdx: number, resIdx: number, key: string,
  ) {
    setHoveredKey(key)
    if (mouseDownRef.current && e.buttons === 1 && anchor) {
      setDragEnd({ chainIdx, resIdx })
    }
  }

  function commitDrag() {
    if (mouseDownRef.current && anchor && dragEnd) {
      const keys = keysInRange(chains, anchor, dragEnd)
      if (keys.length > 1) {
        selectAll(keys)
        syncToMolstar(plugin, keys)
      }
    }
    mouseDownRef.current = false
    setDragEnd(null)
  }

  return (
    <div
      ref={containerRef}
      onMouseUp={commitDrag}
      onMouseLeave={() => { setHoveredKey(null); commitDrag() }}
      style={{
        display: 'flex',
        flexShrink: 0,
        maxHeight: maxStripH,
        overflow: 'hidden',
        background: 'var(--color-secondary-bg)',
        borderBottom: '1px solid var(--color-border)',
        boxSizing: 'border-box',
        userSelect: 'none',
      }}
    >

      {/* ── Colour-mode controls (left, non-scrolling) ── */}
      <div style={{
        width: CONTROLS_W,
        flexShrink: 0,
        borderRight: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '7px 6px',
        alignItems: 'stretch',
        overflowY: 'auto',
      }}>

        {/* Colour mode dropdown */}
        <select
          value={colorMode}
          onChange={e => setColorMode(e.target.value as ColorMode)}
          style={{
            fontSize: 9,
            fontFamily: 'Outfit, sans-serif',
            fontWeight: 600,
            padding: '2px 3px',
            borderRadius: 4,
            border: '1px solid var(--color-border)',
            background: 'var(--color-background)',
            color: 'var(--color-text-primary)',
            cursor: 'pointer',
            width: '100%',
            flexShrink: 0,
          }}
        >
          <option value="none">None</option>
          <option value="chemical">Chem</option>
          <option value="hydrophobicity">Hydro</option>
          <option value="plddt">pLDDT</option>
          <option value="rmsd" disabled={!hasRmsd}>RMSD dev{hasRmsd ? '' : ' (no ref)'}</option>
        </select>

        {/* Legend */}
        <ColorLegend mode={colorMode} />

        {/* CDR confidence filter — only shown when annotations are present */}
        {cdrAnnotations && cdrAnnotations.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 8.5, color: 'var(--color-text-disabled)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              CDR conf.
            </span>
            <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
              {(['all', 'medium', 'high'] as CdrConfidenceFilter[]).map((opt, i) => (
                <button
                  key={opt}
                  onClick={() => setCdrConfidenceFilter(opt)}
                  style={{
                    flex: 1,
                    fontSize: 8,
                    fontFamily: 'Outfit, sans-serif',
                    fontWeight: 600,
                    padding: '2px 0',
                    border: 'none',
                    borderLeft: i > 0 ? '1px solid var(--color-border)' : 'none',
                    cursor: 'pointer',
                    background: cdrConfidenceFilter === opt
                      ? 'var(--color-accent)'
                      : 'var(--color-background)',
                    color: cdrConfidenceFilter === opt
                      ? '#0a0e1a'
                      : 'var(--color-text-secondary)',
                    transition: 'background 100ms ease, color 100ms ease',
                  }}
                >
                  {opt === 'all' ? 'All' : opt === 'medium' ? 'Med' : 'High'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Wrapped sequence rows (scrolls vertically) ── */}
      <div ref={contentRef} style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '4px 4px 4px 4px',
        display: 'flex',
        flexDirection: 'column',
        gap: ROW_GAP,
        minWidth: 0,
      }}>
        {displayRows.map((row, idx) => {
          const isChainStart = row.isFirstRow && row.chainIdx > 0
          const chainSpans   = spansByChain?.get(row.chain.chain) ?? null

          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                flexShrink: 0,
                marginTop: isChainStart ? 4 : 0,
              }}
            >
              {/* Chain label (first row of chain) or indent */}
              <div style={{
                width: CHAIN_PILL_W,
                flexShrink: 0,
                height: ROW_H + (chainSpans ? ANNOT_H : 0),
                display: 'flex',
                alignItems: chainSpans ? 'center' : 'flex-end',
                paddingBottom: chainSpans ? 0 : 1,
              }}>
                {row.isFirstRow ? (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '2px 7px',
                    borderRadius: 99,
                    fontSize: 10,
                    fontWeight: 700,
                    fontFamily: 'Outfit, sans-serif',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'var(--color-accent)',
                    background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--color-accent) 28%, transparent)',
                    whiteSpace: 'nowrap',
                  }}>
                    {row.chain.chain}
                  </span>
                ) : (
                  <span style={{
                    fontSize: 7,
                    color: 'var(--color-text-disabled)',
                    opacity: 0.4,
                    paddingLeft: 4,
                    lineHeight: 1,
                  }}>
                    ↳
                  </span>
                )}
              </div>

              {/* Annotation track + number row + AA row, stacked */}
              <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

                {/* CDR/FW annotation track */}
                {chainSpans && (
                  <AnnotationTrack
                    rowStartIdx={row.rowStartIdx}
                    rowLength={row.residues.length}
                    spans={chainSpans}
                  />
                )}

                {/* Residue-number annotation line */}
                <div style={{ display: 'flex', height: NUM_H }}>
                  {row.residues.map((res, i) => {
                    const globalIdx  = row.rowStartIdx + i
                    const showNum    = globalIdx === 0 || res.number % 10 === 0
                    const isChunkEnd = (globalIdx + 1) % CHUNK === 0 && i < row.residues.length - 1

                    return (
                      <React.Fragment key={i}>
                        <div style={{ width: CELL_W, height: NUM_H, position: 'relative', flexShrink: 0 }}>
                          {showNum && (
                            <>
                              <span style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                fontSize: 7,
                                lineHeight: 1,
                                fontFamily: 'JetBrains Mono, monospace',
                                color: 'var(--color-text-disabled)',
                                whiteSpace: 'nowrap',
                                pointerEvents: 'none',
                              }}>
                                {res.number}
                              </span>
                              <div style={{
                                position: 'absolute',
                                left: 0,
                                bottom: 0,
                                width: 1,
                                height: 3,
                                background: 'var(--color-text-disabled)',
                                opacity: 0.35,
                              }} />
                            </>
                          )}
                        </div>
                        {isChunkEnd && <div style={{ width: CHUNK_GAP, flexShrink: 0 }} />}
                      </React.Fragment>
                    )
                  })}
                </div>

                {/* Amino-acid cell line */}
                <div style={{ display: 'flex', height: AA_H }}>
                  {row.residues.map((res, i) => {
                    const globalIdx  = row.rowStartIdx + i
                    const resIdx     = row.rowStartIdx + i
                    const key        = `${row.chain.chain}:${res.number}`
                    const isSelected  = selectedResidues.has(key)
                    const isDragRange = dragKeys.has(key)
                    const isActive    = isSelected || isDragRange
                    const isHovered   = hoveredKey === key
                    const isChunkEnd  = (globalIdx + 1) % CHUNK === 0 && i < row.residues.length - 1

                    const { bg: modeBg, fg: modeFg } = cellColors(res.code, key, row.chain.chain, resIdx)
                    const dimBg  = `color-mix(in srgb, ${modeBg} 65%, transparent)`
                    const namedSelColor = !isActive ? namedSelColorMap.get(key) : undefined
                    const namedSelHex   = namedSelColor !== undefined
                      ? `#${namedSelColor.toString(16).padStart(6, '0')}`
                      : undefined
                    const rawBg  = isActive
                      ? 'var(--color-accent)'
                      : isHovered
                        ? `color-mix(in srgb, var(--color-accent) 28%, ${modeBg})`
                        : dimBg
                    const cellBg = !isActive && namedSelHex
                      ? `color-mix(in srgb, ${namedSelHex} 22%, ${rawBg})`
                      : rawBg
                    const cellFg = isActive ? '#0a0e1a' : modeFg

                    return (
                      <React.Fragment key={i}>
                        <div
                          title={`Chain ${row.chain.chain} · ${res.number} · ${res.code}`}
                          onMouseDown={e => handleCellMouseDown(e, row.chainIdx, resIdx, row.chain.chain, res.number)}
                          onMouseEnter={e => handleCellMouseEnter(e, row.chainIdx, resIdx, key)}
                          onMouseLeave={() => setHoveredKey(null)}
                          style={{
                            width: CELL_W,
                            height: AA_H,
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: cellBg,
                            color: cellFg,
                            fontSize: 11,
                            fontFamily: 'JetBrains Mono, monospace',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: isActive ? 'none' : 'background 60ms ease',
                            boxSizing: 'border-box',
                            borderRight: !isChunkEnd && i < row.residues.length - 1
                              ? '1px solid rgba(128,128,128,0.14)'
                              : 'none',
                            borderBottom: isSelected
                              ? '2px solid color-mix(in srgb, var(--color-accent) 80%, #fff)'
                              : namedSelHex
                                ? `2px solid ${namedSelHex}`
                                : '2px solid transparent',
                          }}
                        >
                          {res.code}
                        </div>
                        {isChunkEnd && <div style={{ width: CHUNK_GAP, height: AA_H, flexShrink: 0 }} />}
                      </React.Fragment>
                    )
                  })}
                </div>

              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}
