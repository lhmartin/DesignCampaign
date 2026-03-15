import React, { useState, useRef, useMemo, useEffect } from 'react'
import type { ChainSequence } from '@/lib/sequence'
import { residueColor, HYDROPHOBICITY_SCALE } from '@/lib/sequence'
import { useSelectionStore } from '@/stores/selection-store'

type PluginUIContext = import('molstar/lib/mol-plugin-ui/context').PluginUIContext

// ─── Layout constants ─────────────────────────────────────────────────────────
const CELL_W       = 12   // px per residue cell (tight — was 16)
const NUM_H        = 11   // px for residue-number annotation row
const AA_H         = 17   // px for amino-acid cell row
const ROW_H        = NUM_H + AA_H   // 28 px per wrapped row
const CHUNK        = 8    // residues per chunk
const CHUNK_GAP    = 4    // px gap between chunks
const ROW_GAP      = 3    // px gap between wrapped rows
const MAX_ROWS     = 6    // max visible rows before vertical scroll
const CONTROLS_W   = 50   // px width of left colour-mode controls
const CHAIN_PILL_W = 28   // px width reserved for chain label
const MAX_STRIP_H  = MAX_ROWS * ROW_H + (MAX_ROWS - 1) * ROW_GAP + 12  // ≈ 185 px

// ─── Color mode ───────────────────────────────────────────────────────────────
type ColorMode = 'chemical' | 'hydrophobicity' | 'plddt'

// ─── Color helpers ────────────────────────────────────────────────────────────
function lerpHex(a: string, b: string, t: number): string {
  const ah = parseInt(a.slice(1), 16)
  const bh = parseInt(b.slice(1), 16)
  const ar = (ah >> 16) & 0xff, ag = (ah >> 8) & 0xff, ab = ah & 0xff
  const br = (bh >> 16) & 0xff, bg2 = (bh >> 8) & 0xff, bb = bh & 0xff
  const r  = Math.round(ar + (br - ar) * t)
  const g  = Math.round(ag + (bg2 - ag) * t)
  const b2 = Math.round(ab + (bb - ab) * t)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b2.toString(16).padStart(2, '0')}`
}

function hydroColor(code: string): { bg: string; fg: string } {
  const h = HYDROPHOBICITY_SCALE[code] ?? 0
  const t = Math.max(0, Math.min(1, (h + 4.5) / 9))
  return { bg: lerpHex('#3b82f6', '#f97316', t), fg: '#ffffff' }
}

function plddtColor(value: number | undefined): { bg: string; fg: string } {
  if (value === undefined) return { bg: 'rgba(120,120,140,0.25)', fg: '#888898' }
  if (value >= 90) return { bg: '#0053d6', fg: '#ffffff' }
  if (value >= 70) return { bg: '#65cbf3', fg: '#0a0e1a' }
  if (value >= 50) return { bg: '#ffdb13', fg: '#0a0e1a' }
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

// ─── Mol* 3D sync ─────────────────────────────────────────────────────────────
async function syncToMolstar(plugin: PluginUIContext | null, keys: string[]): Promise<void> {
  if (!plugin) return
  if (keys.length === 0) {
    try { plugin.managers.interactivity.lociSelects.deselectAll() } catch { /* best effort */ }
    return
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { Script } = await import('molstar/lib/mol-script/script') as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { StructureSelection } = await import('molstar/lib/mol-model/structure') as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { MolScriptBuilder: B } = await import('molstar/lib/mol-script/language/builder') as any
    const struct = plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data
    if (!struct) return

    const byChain: Record<string, number[]> = {}
    for (const key of keys) {
      const [chainId, resIdStr] = key.split(':')
      ;(byChain[chainId] ??= []).push(Number(resIdStr))
    }

    const exprs = Object.entries(byChain).map(([chainId, resIds]) =>
      B.struct.generator.atomGroups({
        'chain-test': B.core.rel.eq([B.struct.atomProperty.macromolecular.auth_asym_id(), chainId]),
        'residue-test': B.core.set.has([
          B.set(...resIds),
          B.struct.atomProperty.macromolecular.auth_seq_id(),
        ]),
      })
    )
    const query = exprs.length === 1 ? exprs[0] : B.struct.combinator.merge(exprs)
    const sel = Script.getStructureSelection((_: unknown) => query, struct)
    const loci = StructureSelection.toLociWithSourceUnits(sel)
    plugin.managers.interactivity.lociSelects.selectOnly({ loci })
  } catch { /* best effort — 3D sync is non-critical */ }
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
  const [containerWidth, setContainerWidth] = useState(800)

  // Track container width for wrapping calculation
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // How many residues fit on one row
  const residuesPerRow = useMemo(() => {
    const usable = containerWidth - CONTROLS_W - CHAIN_PILL_W - 16  // 16 = left+right padding
    return Math.max(CHUNK, Math.floor(usable / CELL_W))
  }, [containerWidth])

  // Live drag preview
  const dragKeys = useMemo<Set<string>>(() => {
    if (!anchor || !dragEnd) return new Set()
    return new Set(keysInRange(chains, anchor, dragEnd))
  }, [chains, anchor, dragEnd])

  if (chains.length === 0) return null

  // ── Cell color by mode ──────────────────────────────────────────────────────
  function cellColors(code: string, key: string): { bg: string; fg: string } {
    if (colorMode === 'hydrophobicity') return hydroColor(code)
    if (colorMode === 'plddt') return plddtColor(residueValues?.get(key))
    return residueColor(code)
  }

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

  // ── Color mode labels ───────────────────────────────────────────────────────
  const MODES: { mode: ColorMode; label: string }[] = [
    { mode: 'chemical',       label: 'Chem'  },
    { mode: 'hydrophobicity', label: 'Hydro' },
    { mode: 'plddt',          label: 'pLDDT' },
  ]

  // ── Build wrapped display rows across all chains ─────────────────────────────
  const displayRows = chains.flatMap((chain, ci) => {
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
        gap: 3,
        padding: '7px 6px 7px 8px',
        alignItems: 'flex-start',
      }}>
        {MODES.map(({ mode, label }) => (
          <button
            key={mode}
            onClick={() => setColorMode(mode)}
            style={{
              padding: '1px 5px',
              borderRadius: 99,
              fontSize: 8,
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 600,
              letterSpacing: '0.03em',
              border: colorMode === mode
                ? '1px solid color-mix(in srgb, var(--color-accent) 50%, transparent)'
                : '1px solid var(--color-border)',
              background: colorMode === mode
                ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)'
                : 'transparent',
              color: colorMode === mode
                ? 'var(--color-accent)'
                : 'var(--color-text-disabled)',
              cursor: 'pointer',
              transition: 'all 0.1s',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Wrapped sequence rows (scrolls vertically) ── */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '4px 8px 4px 4px',
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
                    padding: '1px 4px',
                    borderRadius: 99,
                    fontSize: 7.5,
                    fontWeight: 700,
                    fontFamily: 'Outfit, sans-serif',
                    letterSpacing: '0.05em',
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
                    const cellBg = isActive
                      ? 'var(--color-accent)'
                      : isHovered
                        ? `color-mix(in srgb, var(--color-accent) 28%, ${modeBg})`
                        : modeBg
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
                            fontSize: 8.5,
                            fontFamily: 'JetBrains Mono, monospace',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: isActive ? 'none' : 'background 60ms ease',
                            boxSizing: 'border-box',
                            borderRight: !isChunkEnd && i < row.residues.length - 1
                              ? '1px solid rgba(0,0,0,0.07)'
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
