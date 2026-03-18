import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react'
import type { ChainSequence } from '@/lib/sequence'
import { residueColor, HYDROPHOBICITY_SCALE } from '@/lib/sequence'
import { lerpColor } from '@/lib/constants/colors'
import { useSelectionStore } from '@/stores/selection-store'
import { syncToMolstar } from '@/lib/mol-selection-sync'

type PluginUIContext = import('molstar/lib/mol-plugin-ui/context').PluginUIContext

// ─── Layout constants ─────────────────────────────────────────────────────────
const CELL_W       = 10   // px per residue cell
const NUM_H        = 11   // px for residue-number annotation row
const AA_H         = 17   // px for amino-acid cell row
const ROW_H        = NUM_H + AA_H   // 28 px per wrapped row
const CHUNK        = 8    // residues per chunk
const CHUNK_GAP    = 2    // px gap between chunks
const ROW_GAP      = 1    // px gap between wrapped rows
const MAX_ROWS     = 6    // max visible rows before vertical scroll
const CONTROLS_W   = 90   // px width of left colour-mode controls
const CHAIN_PILL_W = 36   // px width reserved for chain label
const MAX_STRIP_H  = MAX_ROWS * ROW_H + (MAX_ROWS - 1) * ROW_GAP + 12  // ≈ 185 px (recomputes with ROW_GAP)

// ─── Color mode ───────────────────────────────────────────────────────────────
type ColorMode = 'none' | 'chemical' | 'hydrophobicity' | 'plddt'

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
}

// ─── Component ───────────────────────────────────────────────────────────────
export function SequenceViewer({ chains, plugin, residueValues }: SequenceViewerProps) {
  const { selectedResidues, addResidue, clearSelection, selectAll } = useSelectionStore()

  const [colorMode, setColorMode] = useState<ColorMode>('chemical')
  const [hoveredKey, setHoveredKey]   = useState<string | null>(null)
  const [anchor, setAnchor]           = useState<Pos | null>(null)
  const [dragEnd, setDragEnd]         = useState<Pos | null>(null)
  const mouseDownRef                  = useRef(false)
  const containerRef                  = useRef<HTMLDivElement>(null)
  const contentRef                    = useRef<HTMLDivElement>(null)
  // contentRect.width from the scrollable content div already excludes padding
  // and the vertical scrollbar — no manual offsets needed.
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

  // How many residues fit on one row.
  // contentWidth comes from contentRect.width on the scrollable div — already
  // excludes padding and any vertical scrollbar, so only the chain pill and a
  // safety margin need to be subtracted.
  // Each group of CHUNK residues is followed by a CHUNK_GAP spacer, so the
  // effective per-residue width is CELL_W + CHUNK_GAP/CHUNK.
  const residuesPerRow = useMemo(() => {
    const usable = contentWidth - CHAIN_PILL_W - 32  // 32px aggressive safety margin
    return Math.max(CHUNK, Math.floor(usable / (CELL_W + CHUNK_GAP / CHUNK)))
  }, [contentWidth])

  // Live drag preview
  const dragKeys = useMemo<Set<string>>(() => {
    if (!anchor || !dragEnd) return new Set()
    return new Set(keysInRange(chains, anchor, dragEnd))
  }, [chains, anchor, dragEnd])

  // Pre-build wrapped display rows — only recomputes when chains or layout changes, not on hover
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

  if (chains.length === 0) return null

  // ── Cell color by mode ──────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cellColors = useCallback((code: string, key: string): { bg: string; fg: string } => {
    if (colorMode === 'none')          return { bg: 'rgba(120,120,140,0.10)', fg: 'var(--color-text-disabled)' }
    if (colorMode === 'hydrophobicity') return hydroColor(code)
    if (colorMode === 'plddt')          return plddtColor(residueValues?.get(key))
    return residueColor(code)
  }, [colorMode, residueValues])

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
        maxHeight: MAX_STRIP_H,
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
        {/* Dropdown */}
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
        </select>

        {/* Legend */}
        <ColorLegend mode={colorMode} />
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
          // Small extra gap before first row of a new chain (except very first)
          const isChainStart = row.isFirstRow && row.chainIdx > 0

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
                height: ROW_H,
                display: 'flex',
                alignItems: 'flex-end',
                paddingBottom: 1,
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
                  // Subtle continuation indicator
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

              {/* Number row + AA row, stacked */}
              <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

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

                    const { bg: modeBg, fg: modeFg } = cellColors(res.code, key)
                    const dimBg  = `color-mix(in srgb, ${modeBg} 65%, transparent)`
                    const cellBg = isActive
                      ? 'var(--color-accent)'
                      : isHovered
                        ? `color-mix(in srgb, var(--color-accent) 28%, ${modeBg})`
                        : dimBg
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
