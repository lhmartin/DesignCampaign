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

// ── Layout constants ──────────────────────────────────────────────────────────

const CELL_W = 10   // px per residue column
const CELL_H = 16   // px per sequence row
const NAME_W = 112  // px for the sticky row-name label
const NUM_H  = 11   // px for the position-number sticky header
const CONS_H = 5    // px for conservation bar

// ── Types ─────────────────────────────────────────────────────────────────────

type ColorMode = 'chemical' | 'conservation' | 'none'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Pick the longest chain per structure (proxy for the heavy chain in ab designs). */
function pickChain(chains: { chain: string; seq: string }[]): string | null {
  if (chains.length === 0) return null
  return chains.reduce((best, c) => c.seq.length > best.seq.length ? c : best).seq
}

// ── PNG export ────────────────────────────────────────────────────────────────

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

  const W = NAME_W + len * CELL_W
  const H = NUM_H + CONS_H + n * CELL_H + 4
  const dpr = window.devicePixelRatio || 1
  const canvas = document.createElement('canvas')
  canvas.width  = W * dpr
  canvas.height = H * dpr
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)

  ctx.fillStyle = isDark ? '#0e1525' : '#f8f9fc'
  ctx.fillRect(0, 0, W, H)

  // Position numbers
  ctx.font = `${NUM_H - 1}px JetBrains Mono, monospace`
  ctx.fillStyle = isDark ? '#8faac8' : '#4a607c'
  for (let col = 0; col < len; col += 10) {
    ctx.fillText(String(col + 1), NAME_W + col * CELL_W, NUM_H - 1)
  }

  // Conservation bar
  for (let col = 0; col < len; col++) {
    const bg = conservationColor(conservation[col] ?? 0, isDark)
    if (bg !== 'transparent') {
      ctx.fillStyle = bg
      ctx.fillRect(NAME_W + col * CELL_W, NUM_H, CELL_W, CONS_H)
    }
  }

  // Sequence rows
  ctx.font = `bold ${CELL_H - 3}px JetBrains Mono, monospace`
  for (let row = 0; row < n; row++) {
    const y = NUM_H + CONS_H + row * CELL_H
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

// ── Component ─────────────────────────────────────────────────────────────────

interface AlignmentViewerProps {
  viewerRef?: RefObject<MolstarViewerHandle | null>
}

export function AlignmentViewer({ viewerRef }: AlignmentViewerProps = {}) {
  const { rows, allColumns, filterText } = useMetricsStore()
  const { rules: filterRules }           = useFilterStore()
  const { sequences }                    = useSequenceStore()
  const { files, setActiveFile }         = useFileStore()
  const isDark                           = useIsDark()
  const [colorMode, setColorMode]        = useState<ColorMode>('chemical')

  const activeRows = useActiveRows(rows, filterText, filterRules)

  // Build star alignment from active rows that have stored sequences
  const { aligned, names, conservation } = useMemo(() => {
    const nameList: string[] = []
    const seqList:  string[] = []
    for (const row of activeRows) {
      const chains = sequences.get(row.name)
      if (!chains) continue
      const seq = pickChain(chains)
      if (!seq || seq.length < 4) continue
      nameList.push(row.name)
      seqList.push(seq)
    }
    if (seqList.length < 2) return { aligned: seqList, names: nameList, conservation: [] as number[] }
    const al   = starAlign(seqList)
    const cons = columnConservation(al)
    return { aligned: al, names: nameList, conservation: cons }
  }, [activeRows, sequences])

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
    allColumns.length === 0
      ? 'no-metrics'
      : sequences.size === 0 && rows.length > 0
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
}

const AlignmentGrid = memo(function AlignmentGrid({ aligned, names, conservation, colorMode, isDark, onLoad }: GridProps) {
  const n   = names.length
  const len = aligned[0]?.length ?? 0
  if (!n || !len) return null

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

      {/* Conservation bar */}
      {colorMode !== 'none' && (
        <div style={{ display: 'flex', height: CONS_H, paddingLeft: NAME_W, position: 'sticky', top: NUM_H, zIndex: 2 }}>
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
