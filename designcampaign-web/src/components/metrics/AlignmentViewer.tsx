import { useMemo, useState, useCallback, memo, type RefObject } from 'react'
import { useMetricsStore } from '@/stores/metrics-store'
import { useFilterStore } from '@/stores/filter-store'
import { useSequenceStore } from '@/stores/sequence-store'
import { useFileStore } from '@/stores/file-store'
import { useIsDark } from '@/hooks/useIsDark'
import { useActiveRows } from '@/hooks/useActiveRows'
import { starAlign } from '@/lib/alignment/nw-align'
import {
  clustalColor, cellTextColor,
  columnConservation, conservationColor,
} from '@/lib/alignment/alignment-colors'
import type { MolstarViewerHandle } from '@/components/viewer/MolstarViewer'
import { useAntpackStore, CDR_CONFIDENCE_THRESHOLDS, REGION_COLORS, buildCdrSpans } from '@/stores/antpack-store'
import type { CdrRegionName, ChainCdrAnnotation } from '@/stores/antpack-store'

// Stable empty map — returned by the antpack selector when CDR track is off so
// Zustand doesn't trigger re-renders for annotation changes we don't care about.
const EMPTY_ANNOTATIONS = new Map<string, ChainCdrAnnotation[]>()

// ── Layout constants ──────────────────────────────────────────────────────────

const CELL_W = 10   // px per residue column
const CELL_H = 16   // px per sequence row
const NAME_W = 112  // px for the sticky row-name label
const NUM_H  = 11   // px for the position-number sticky header
const CONS_H = 5    // px for conservation bar
const CDR_H  = 13   // px for CDR/FW annotation track

// ── Types ─────────────────────────────────────────────────────────────────────

type ColorMode = 'chemical' | 'conservation' | 'none'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * From a set of per-structure chain lists, build a map of sequence → how many structures
 * contain that exact sequence.  Chains shared by many structures are the conserved target;
 * chains unique to one structure are the variable binder.
 */
// TODO: Binder chain auto-detection (future enhancement)
// The current approach picks the chain with the lowest occurrence count across all structures
// (i.e. the most unique/variable chain = binder). This works well when loading a folder of
// complexes against the same target, where the target sequence is conserved and the binder
// varies. A future improvement would let users explicitly designate binder/target chains —
// either globally (via the interface detection panel) or per-structure — so the alignment
// can be driven by that explicit assignment rather than sequence variability heuristics.
function buildSeqCounts(
  rows: { filePath: string | null; name: string }[],
  sequences: Map<string, { chain: string; seq: string }[]>,
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const chains = sequences.get(row.filePath ?? row.name) ?? sequences.get(row.name)
    if (!chains) continue
    for (const { seq } of chains) {
      if (seq.length >= 4) counts.set(seq, (counts.get(seq) ?? 0) + 1)
    }
  }
  return counts
}

/**
 * Pick the most-unique chain for one structure: lowest occurrence count across all
 * loaded structures.  Ties broken by shortest chain (binders are typically shorter
 * than targets).  Falls back gracefully for single-chain structures.
 */
function pickBinderChain(
  chains: { chain: string; seq: string }[],
  seqCounts: Map<string, number>,
): { seq: string; chainId: string } | null {
  const eligible = chains.filter(c => c.seq.length >= 4)
  if (eligible.length === 0) return null
  const winner = eligible.reduce((best, c) => {
    const bc = seqCounts.get(best.seq) ?? 0
    const cc = seqCounts.get(c.seq) ?? 0
    if (cc !== bc) return cc < bc ? c : best   // lower count = more unique = binder
    return c.seq.length < best.seq.length ? c : best  // shorter wins on tie
  })
  return { seq: winner.seq, chainId: winner.chain }
}

// ── Legend data ───────────────────────────────────────────────────────────────

const LEGEND_ITEMS_CHEMICAL = [
  { bg: 'rgba(255,155,60,0.85)',   label: 'Nonpolar' },
  { bg: 'rgba(72,200,110,0.85)',   label: 'Polar' },
  { bg: 'rgba(80,140,255,0.85)',   label: '+Charged' },
  { bg: 'rgba(255,80,80,0.85)',    label: '−Charged' },
  { bg: 'rgba(160,160,180,0.85)', label: 'Gly' },
] as const

const LEGEND_H = 22   // extra canvas height for legend strip

// ── PNG export ────────────────────────────────────────────────────────────────

function drawPngLegend(
  ctx: CanvasRenderingContext2D,
  yTop: number,
  colorMode: ColorMode,
  isDark: boolean,
): void {
  const labelColor = isDark ? '#8faac8' : '#4a607c'
  ctx.font = `9px JetBrains Mono, monospace`

  if (colorMode === 'chemical') {
    let x = NAME_W
    for (const { bg, label } of LEGEND_ITEMS_CHEMICAL) {
      ctx.fillStyle = bg
      ctx.fillRect(x, yTop + 6, 9, 9)
      ctx.fillStyle = labelColor
      ctx.fillText(label, x + 12, yTop + 14)
      x += 12 + ctx.measureText(label).width + 14
    }
  }

  if (colorMode === 'conservation') {
    const x = NAME_W
    const grad = ctx.createLinearGradient(x, 0, x + 80, 0)
    grad.addColorStop(0, 'rgba(128,128,128,0.15)')
    grad.addColorStop(1, isDark ? 'rgba(0,210,100,0.70)' : 'rgba(0,150,70,0.57)')
    ctx.fillStyle = grad
    ctx.fillRect(x, yTop + 6, 80, 9)
    ctx.fillStyle = labelColor
    ctx.fillText('Low → High conservation', x + 84, yTop + 14)
  }
}

function exportPng(
  names: string[],
  aligned: string[],
  conservation: number[],
  colorMode: ColorMode,
  isDark: boolean,
): void {
  const n   = names.length
  const len = aligned[0]?.length ?? 0
  if (!n || !len) return

  const hasLegend = colorMode !== 'none'
  const legendOffset = hasLegend ? LEGEND_H : 0
  const W = NAME_W + len * CELL_W
  const H = legendOffset + NUM_H + CONS_H + n * CELL_H + 4
  const dpr = window.devicePixelRatio || 1
  const canvas = document.createElement('canvas')
  canvas.width  = W * dpr
  canvas.height = H * dpr
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)

  ctx.fillStyle = isDark ? '#0e1525' : '#f8f9fc'
  ctx.fillRect(0, 0, W, H)

  // Legend (top strip, mirrors UI position)
  if (hasLegend) {
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'
    ctx.fillRect(0, 0, W, LEGEND_H)
    drawPngLegend(ctx, 0, colorMode, isDark)
  }

  // Position numbers
  ctx.font = `${NUM_H - 1}px JetBrains Mono, monospace`
  ctx.fillStyle = isDark ? '#8faac8' : '#4a607c'
  for (let col = 0; col < len; col += 10) {
    ctx.fillText(String(col + 1), NAME_W + col * CELL_W, legendOffset + NUM_H - 1)
  }

  // Conservation bar
  for (let col = 0; col < len; col++) {
    const bg = conservationColor(conservation[col] ?? 0, isDark)
    if (bg !== 'transparent') {
      ctx.fillStyle = bg
      ctx.fillRect(NAME_W + col * CELL_W, legendOffset + NUM_H, CELL_W, CONS_H)
    }
  }

  // Sequence rows
  ctx.font = `bold ${CELL_H - 3}px JetBrains Mono, monospace`
  for (let row = 0; row < n; row++) {
    const y = legendOffset + NUM_H + CONS_H + row * CELL_H
    ctx.fillStyle = isDark ? '#b0c8e4' : '#374151'
    ctx.fillText(names[row].slice(0, 12), 2, y + CELL_H - 3)

    for (let col = 0; col < len; col++) {
      const aa = aligned[row][col] ?? '-'
      const x  = NAME_W + col * CELL_W
      const bg = colorMode === 'chemical'
        ? clustalColor(aa, isDark)
        : colorMode === 'conservation'
          ? conservationColor(conservation[col] ?? 0, isDark)
          : 'transparent'
      if (bg !== 'transparent') { ctx.fillStyle = bg; ctx.fillRect(x, y, CELL_W, CELL_H) }
      ctx.fillStyle = cellTextColor(aa, isDark)
      ctx.fillText(aa === '-' ? '·' : aa, x + 1, y + CELL_H - 3)
    }
  }

  canvas.toBlob(blob => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), { href: url, download: 'alignment.png' })
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}

// ── Legend component (UI) ─────────────────────────────────────────────────────

function AlignmentLegend({ mode }: { mode: ColorMode }) {
  if (mode === 'none') return null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      padding: '5px 10px', flexShrink: 0,
      borderBottom: '1px solid var(--color-border)',
      background: 'var(--color-secondary-bg)',
    }}>
      {mode === 'chemical' && LEGEND_ITEMS_CHEMICAL.map(({ bg, label }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{
            width: 9, height: 9, borderRadius: 2, background: bg, flexShrink: 0,
            border: '1px solid rgba(128,128,128,0.15)',
          }} />
          <span style={{ fontSize: 9.5, color: 'var(--color-text-secondary)', lineHeight: 1, whiteSpace: 'nowrap' }}>
            {label}
          </span>
        </div>
      ))}
      {mode === 'conservation' && (
        <>
          <div style={{
            width: 60, height: 9, borderRadius: 2,
            background: 'linear-gradient(to right, rgba(128,128,128,0.15), rgba(0,180,80,0.65))',
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 9.5, color: 'var(--color-text-secondary)', lineHeight: 1, whiteSpace: 'nowrap' }}>
            Low → High conservation
          </span>
        </>
      )}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface AlignmentViewerProps {
  viewerRef?: RefObject<MolstarViewerHandle | null>
}

export function AlignmentViewer({ viewerRef }: AlignmentViewerProps = {}) {
  const { rows, filterText } = useMetricsStore()
  const { rules: filterRules }           = useFilterStore()
  const { sequencesByPath }              = useSequenceStore()
  const { files, setActiveFile }         = useFileStore()
  const isDark                           = useIsDark()
  const [colorMode, setColorMode]        = useState<ColorMode>('chemical')
  const [showCdrTrack, setShowCdrTrack]  = useState(false)

  const activeRows = useActiveRows(rows, filterText, filterRules)

  // Build star alignment from active rows that have stored sequences.
  // Two-pass: first count how often each sequence appears across all structures
  // (the shared target scores high; the unique binder scores 1), then per structure
  // pick the chain with the lowest count (= most likely binder).
  const { aligned, names, conservation, filePaths, binderChainIds } = useMemo(() => {
    const seqCounts = buildSeqCounts(activeRows, sequencesByPath)
    const nameList:     string[] = []
    const seqList:      string[] = []
    const filePathList: string[] = []
    const chainIdList:  string[] = []
    for (const row of activeRows) {
      const chains = sequencesByPath.get(row.filePath ?? row.name)
      if (!chains?.length) continue
      const result = pickBinderChain(chains, seqCounts)
      if (!result) continue
      nameList.push(row.name)
      seqList.push(result.seq)
      filePathList.push(row.filePath ?? row.name)
      chainIdList.push(result.chainId)
    }
    if (seqList.length < 2) return { aligned: seqList, names: nameList, conservation: [] as number[], filePaths: filePathList, binderChainIds: chainIdList }
    const al   = starAlign(seqList)
    const cons = columnConservation(al)
    return { aligned: al, names: nameList, conservation: cons, filePaths: filePathList, binderChainIds: chainIdList }
  }, [activeRows, sequencesByPath])

  // Stable fallback: when CDR track is off, selectors return these so Zustand
  // won't re-render AlignmentViewer on annotation changes.
  const annotations         = useAntpackStore(s => showCdrTrack ? s.annotationsByPath : EMPTY_ANNOTATIONS)
  const cdrConfidenceFilter = useAntpackStore(s => showCdrTrack ? s.cdrConfidenceFilter : 'all')

  const cdrTrack = useMemo((): (CdrRegionName | null)[] => {
    if (!showCdrTrack || !aligned.length) return []
    const len = aligned[0].length
    const threshold = CDR_CONFIDENCE_THRESHOLDS[cdrConfidenceFilter]
    const votes = Array.from({ length: len }, () => new Map<CdrRegionName, number>())
    for (let rowIdx = 0; rowIdx < aligned.length; rowIdx++) {
      const fileAnnotations = annotations.get(filePaths[rowIdx])
      if (!fileAnnotations) continue
      const chainAnnot = fileAnnotations.find(
        a => a.chain === binderChainIds[rowIdx] && a.percentIdentity >= threshold,
      )
      if (!chainAnnot?.assignments) continue
      const alignedSeq = aligned[rowIdx]
      let residueIdx = 0
      for (let col = 0; col < len; col++) {
        if (alignedSeq[col] === '-') continue
        const region = chainAnnot.assignments[residueIdx]
        if (region) votes[col].set(region, (votes[col].get(region) ?? 0) + 1)
        residueIdx++
      }
    }
    return votes.map(colVotes => {
      if (!colVotes.size) return null
      return [...colVotes.entries()].sort((a, b) => b[1] - a[1])[0][0]
    })
  }, [showCdrTrack, aligned, filePaths, binderChainIds, annotations, cdrConfidenceFilter])

  const handleLoad = useCallback((name: string) => {
    const file =
      files.find(f => f.name.replace(/\.[^.]+$/, '') === name) ??
      files.find(f => f.path.includes(name))
    if (!file) return
    setActiveFile(file.path)
    viewerRef?.current?.loadFromFile(file.path)
  }, [files, setActiveFile, viewerRef])

  const n   = names.length
  const len = aligned[0]?.length ?? 0
  const hasData = n >= 2 && len > 0

  // Empty-state reason
  const emptyReason =
    rows.length === 0
      ? 'no-metrics'
      : sequencesByPath.size === 0
        ? 'no-sequences'
        : 'too-few'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 10px', flexShrink: 0,
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-secondary-bg)',
      }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'var(--color-accent)', opacity: 0.8,
        }}>
          Alignment
        </span>

        {hasData && (
          <>
            <select
              value={colorMode}
              onChange={e => setColorMode(e.target.value as ColorMode)}
              style={{
                fontSize: 10, fontFamily: 'Outfit, sans-serif',
                color: 'var(--color-text-primary)',
                background: 'var(--color-secondary-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 4, padding: '1px 18px 1px 5px',
                outline: 'none', cursor: 'pointer', appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2300c8a8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 3px center',
              }}
            >
              <option value="chemical">Chemical</option>
              <option value="conservation">Conservation</option>
              <option value="none">None</option>
            </select>

            <span style={{
              marginLeft: 'auto', fontSize: 10, whiteSpace: 'nowrap',
              color: 'var(--color-text-disabled)', fontFamily: 'JetBrains Mono, monospace',
            }}>
              {n} seqs · {len} cols
            </span>

            <button
              onClick={() => setShowCdrTrack(v => !v)}
              title={showCdrTrack ? 'Hide CDR/FW regions' : 'Show CDR/FW regions'}
              style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 4,
                border: '1px solid var(--color-border)', cursor: 'pointer',
                background: showCdrTrack ? 'var(--color-accent)' : 'transparent',
                color: showCdrTrack ? 'var(--color-bg)' : 'var(--color-text-secondary)',
                flexShrink: 0,
              }}
            >
              CDR
            </button>

            <button
              onClick={() => exportPng(names, aligned, conservation, colorMode, isDark)}
              title="Export alignment as PNG"
              style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 4,
                border: '1px solid var(--color-border)', cursor: 'pointer',
                background: 'transparent', color: 'var(--color-text-secondary)',
                flexShrink: 0,
              }}
            >
              ⬇ PNG
            </button>
          </>
        )}
      </div>

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      {hasData && <AlignmentLegend mode={colorMode} />}

      {/* ── Alignment grid ──────────────────────────────────────────────── */}
      {hasData && (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <AlignmentGrid
            aligned={aligned}
            names={names}
            conservation={conservation}
            colorMode={colorMode}
            isDark={isDark}
            onLoad={handleLoad}
            cdrTrack={cdrTrack}
          />
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!hasData && (
        <div style={{
          position: 'absolute', inset: 0, top: 32,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 10, padding: 24, textAlign: 'center', pointerEvents: 'none',
        }}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" style={{ opacity: 0.25 }}>
            <rect x="4"  y="7"  width="28" height="5" rx="2" fill="var(--color-accent)"/>
            <rect x="4"  y="15" width="22" height="5" rx="2" fill="var(--color-accent)" opacity="0.7"/>
            <rect x="4"  y="23" width="25" height="5" rx="2" fill="var(--color-accent)" opacity="0.5"/>
          </svg>
          <p style={{ fontSize: 12, color: 'var(--color-text-disabled)', margin: 0, lineHeight: 1.6 }}>
            {emptyReason === 'no-metrics'
              ? <>No metrics loaded.<br/>Open a folder and click <b style={{ color: 'var(--color-accent)' }}>Calculate All</b>.</>
              : emptyReason === 'no-sequences'
                ? <>Sequences not yet extracted.<br/>Click <b style={{ color: 'var(--color-accent)' }}>Calculate All</b> in the Metrics tab.</>
                : <>Need at least 2 sequences.<br/>Load more files or relax active filters.</>}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Alignment grid ────────────────────────────────────────────────────────────

interface GridProps {
  aligned: string[]
  names: string[]
  conservation: number[]
  colorMode: ColorMode
  isDark: boolean
  onLoad: (name: string) => void
  cdrTrack?: (CdrRegionName | null)[]
}

const AlignmentGrid = memo(function AlignmentGrid({ aligned, names, conservation, colorMode, isDark, onLoad, cdrTrack }: GridProps) {
  const n   = names.length
  const len = aligned[0]?.length ?? 0
  if (!n || !len) return null

  const cdrSpans = buildCdrSpans(cdrTrack ?? [])
  const hasCdr   = cdrSpans.length > 0

  return (
    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: CELL_H - 3, lineHeight: 1 }}>
      {/* Sticky position-number header */}
      <div style={{
        display: 'flex', height: NUM_H, paddingLeft: NAME_W,
        position: 'sticky', top: 0, zIndex: 2,
        background: 'var(--color-secondary-bg)',
        borderBottom: '1px solid color-mix(in srgb, var(--color-border) 60%, transparent)',
      }}>
        {Array.from({ length: Math.ceil(len / 10) }, (_, i) => (
          <span key={i} style={{
            display: 'inline-block', width: 10 * CELL_W,
            fontSize: 8, color: 'var(--color-text-disabled)',
            overflow: 'hidden', whiteSpace: 'nowrap',
          }}>
            {i * 10 + 1}
          </span>
        ))}
      </div>

      {/* CDR/FW annotation track */}
      {hasCdr && (
        <div style={{
          height: CDR_H,
          position: 'sticky', top: NUM_H, zIndex: 2,
          background: 'var(--color-secondary-bg)',
        }}>
          <div style={{ position: 'relative', height: CDR_H, marginLeft: NAME_W }}>
            {cdrSpans.map(({ region, startIdx, endIdx }) => {
              const w = (endIdx - startIdx + 1) * CELL_W
              const colors = REGION_COLORS[region]
              return (
                <div key={`${region}-${startIdx}`} style={{
                  position: 'absolute',
                  left: startIdx * CELL_W,
                  width: w,
                  height: CDR_H - 2,
                  top: 1,
                  background: colors.bg,
                  color: colors.fg,
                  fontSize: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', whiteSpace: 'nowrap',
                  borderRadius: 2,
                }}>
                  {w >= 22 ? region : ''}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Conservation bar */}
      {colorMode !== 'none' && (
        <div style={{ display: 'flex', height: CONS_H, paddingLeft: NAME_W, position: 'sticky', top: NUM_H + (hasCdr ? CDR_H : 0), zIndex: 2 }}>
          {conservation.map((score, col) => (
            <div key={col} style={{
              width: CELL_W, height: CONS_H, flexShrink: 0,
              background: conservationColor(score, isDark),
            }} />
          ))}
        </div>
      )}

      {/* Rows */}
      {names.map((name, row) => (
        <SequenceRow
          key={name}
          name={name}
          seq={aligned[row]}
          conservation={conservation}
          colorMode={colorMode}
          isDark={isDark}
          onLoad={onLoad}
        />
      ))}
    </div>
  )
})

// Memoised row — only re-renders when its own data changes
const SequenceRow = memo(function SequenceRow({ name, seq, conservation, colorMode, isDark, onLoad }: {
  name: string
  seq: string
  conservation: number[]
  colorMode: ColorMode
  isDark: boolean
  onLoad: (name: string) => void
}) {
  return (
    <div style={{ display: 'flex', height: CELL_H, alignItems: 'stretch' }}>
      {/* Sticky row label */}
      <div
        onClick={() => onLoad(name)}
        title={name}
        style={{
          width: NAME_W, flexShrink: 0,
          display: 'flex', alignItems: 'center',
          paddingLeft: 4, paddingRight: 4,
          fontSize: 9, color: 'var(--color-text-secondary)',
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          cursor: 'pointer',
          borderRight: '1px solid var(--color-border)',
          background: 'var(--color-secondary-bg)',
          position: 'sticky', left: 0, zIndex: 1,
        }}
      >
        {name}
      </div>

      {/* Residue cells */}
      {Array.from({ length: seq.length }, (_, col) => {
        const aa = seq[col]
        const bg = colorMode === 'chemical'
          ? clustalColor(aa, isDark)
          : colorMode === 'conservation'
            ? conservationColor(conservation[col] ?? 0, isDark)
            : 'transparent'
        return (
          <div key={col} style={{
            width: CELL_W, height: CELL_H, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: bg,
            color: cellTextColor(aa, isDark),
            fontSize: CELL_H - 5,
            userSelect: 'none',
          }}>
            {aa === '-' ? '·' : aa}
          </div>
        )
      })}
    </div>
  )
})
