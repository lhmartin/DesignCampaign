import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useFilterStore, type ComparisonOp, type RankingMode, type RankingMetric, type FilterRule, type NumericFilterRule, type ResidueFilterRule, type LiabilityFilterRule } from '@/stores/filter-store'
import { useMetricsStore, type ProteinMetrics } from '@/stores/metrics-store'
import { useBatchInterfaceStore } from '@/stores/batch-interface-store'
import { useInterfaceStore } from '@/stores/interface-store'
import { useAntpackStore } from '@/stores/antpack-store'
import { useSequenceStore } from '@/stores/sequence-store'
import { LIABILITY_PRESETS, CATEGORY_LABELS, LIABILITY_CATEGORIES, customPatternToRegex, type LiabilityCategory, type Severity } from '@/lib/sequence-liabilities'
import { shortLabel } from '@/lib/metrics-labels'
import { downloadBlob } from '@/lib/utils'

const OPS: ComparisonOp[] = ['>=', '>', '<=', '<', '=']

// ─── Ranking computation ──────────────────────────────────────────────────────

function computeRankingScores(
  rows: ProteinMetrics[],
  mode: RankingMode,
  metrics: RankingMetric[],
): Map<string, number> {
  const active = metrics.filter(m => m.active)
  if (active.length === 0 || rows.length === 0) return new Map()

  const scores = new Map<string, number>()

  if (mode === 'borda') {
    const n = rows.length
    for (const m of active) {
      const sorted = [...rows].sort((a, b) => {
        const va = a.metrics[m.metric] ?? (m.direction === 'max' ? -Infinity : Infinity)
        const vb = b.metrics[m.metric] ?? (m.direction === 'max' ? -Infinity : Infinity)
        return m.direction === 'max' ? vb - va : va - vb    // best first
      })
      sorted.forEach((row, idx) => {
        scores.set(row.name, (scores.get(row.name) ?? 0) + (n - idx))
      })
    }
    // Normalise to [0, 1]
    const vals = Array.from(scores.values())
    const min = vals.reduce((a, b) => Math.min(a, b), Infinity)
    const max = vals.reduce((a, b) => Math.max(a, b), -Infinity)
    const range = max - min || 1
    for (const [k, v] of scores) scores.set(k, (v - min) / range)

  } else {
    // Pre-compute per-metric normalisation bounds
    const normParams = new Map<string, { min: number; max: number }>()
    for (const m of active) {
      const vals = rows.map(r => r.metrics[m.metric]).filter((v): v is number => v !== undefined)
      if (vals.length === 0) continue
      normParams.set(m.metric, {
        min: vals.reduce((a, b) => Math.min(a, b), Infinity),
        max: vals.reduce((a, b) => Math.max(a, b), -Infinity),
      })
    }
    const totalWeight = active.reduce((s, m) => s + m.weight, 0) || 1
    for (const row of rows) {
      let score = 0
      for (const m of active) {
        const raw = row.metrics[m.metric]
        const params = normParams.get(m.metric)
        if (raw === undefined || !params) continue
        const range = params.max - params.min || 1
        const norm = (raw - params.min) / range
        score += (m.weight / totalWeight) * (m.direction === 'max' ? norm : 1 - norm)
      }
      scores.set(row.name, score)
    }
  }

  return scores
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 6px' }}>
      <span style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: 'var(--color-text-secondary)',
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
      {children}
    </div>
  )
}

function SmallBtn({
  onClick, title, children, variant = 'default',
}: {
  onClick: () => void
  title?: string
  children: ReactNode
  variant?: 'default' | 'danger' | 'accent'
}) {
  const colors = {
    default: { color: 'var(--color-text-secondary)', bg: 'transparent', border: 'var(--color-border)' },
    danger:  { color: '#f87171',                    bg: 'transparent', border: 'rgba(248,113,113,0.3)' },
    accent:  { color: 'var(--color-accent)',         bg: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', border: 'color-mix(in srgb, var(--color-accent) 30%, transparent)' },
  }[variant]

  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        fontSize: 10,
        padding: '2px 7px',
        borderRadius: 4,
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        color: colors.color,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

// ─── Numeric filter rule row ──────────────────────────────────────────────────

function NumericRuleRow({
  rule, allColumns,
}: {
  rule: NumericFilterRule
  allColumns: string[]
}) {
  const { updateRule, removeRule } = useFilterStore.getState()
  const selStyle: React.CSSProperties = {
    fontSize: 11,
    fontFamily: 'Outfit, sans-serif',
    color: 'var(--color-text-primary)',
    background: 'var(--color-background)',
    border: '1px solid var(--color-border)',
    borderRadius: 4,
    padding: '2px 18px 2px 5px',
    outline: 'none',
    cursor: 'pointer',
    flexShrink: 0,
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 12px' }}>
      {/* Metric */}
      <select
        value={rule.metric}
        onChange={e => updateRule(rule.id, { metric: e.target.value })}
        style={{ ...selStyle, flex: 1, minWidth: 0 }}
      >
        <option value="">— metric —</option>
        {allColumns.map(c => (
          <option key={c} value={c}>{shortLabel(c)}</option>
        ))}
      </select>

      {/* Operator */}
      <select
        value={rule.op}
        onChange={e => updateRule(rule.id, { op: e.target.value as ComparisonOp })}
        style={{ ...selStyle, width: 46 }}
      >
        {OPS.map(op => <option key={op} value={op}>{op}</option>)}
      </select>

      {/* Value */}
      <input
        type="number"
        value={rule.value}
        onChange={e => updateRule(rule.id, { value: parseFloat(e.target.value) || 0 })}
        style={{
          width: 58,
          fontSize: 11,
          fontFamily: 'JetBrains Mono, monospace',
          color: 'var(--color-text-primary)',
          background: 'var(--color-background)',
          border: '1px solid var(--color-border)',
          borderRadius: 4,
          padding: '2px 5px',
          outline: 'none',
          flexShrink: 0,
        }}
      />

      {/* Remove */}
      <button
        onClick={() => removeRule(rule.id)}
        title="Remove rule"
        style={{
          width: 18,
          height: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 3,
          border: 'none',
          background: 'none',
          color: 'var(--color-text-disabled)',
          cursor: 'pointer',
          fontSize: 13,
          flexShrink: 0,
          padding: 0,
        }}
      >
        ×
      </button>
    </div>
  )
}

// ─── Residue filter rule row ──────────────────────────────────────────────────

function ResidueRuleRow({ rule }: { rule: ResidueFilterRule }) {
  const { updateRule, removeRule } = useFilterStore.getState()
  const hasBatchData = useBatchInterfaceStore(s => Object.keys(s.results).length > 0)
  const selStyle: React.CSSProperties = {
    fontSize: 11,
    fontFamily: 'Outfit, sans-serif',
    color: 'var(--color-text-primary)',
    background: 'var(--color-background)',
    border: '1px solid var(--color-border)',
    borderRadius: 4,
    padding: '2px 18px 2px 5px',
    outline: 'none',
    cursor: 'pointer',
    flexShrink: 0,
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 12px' }}>
      {/* Target: paratope / epitope */}
      <select
        value={rule.target}
        onChange={e => updateRule(rule.id, { target: e.target.value as 'paratope' | 'epitope' })}
        style={{ ...selStyle, flexShrink: 0, width: 82 }}
      >
        <option value="paratope">Paratope</option>
        <option value="epitope">Epitope</option>
      </select>

      {/* Residues text input */}
      <input
        type="text"
        value={rule.residues}
        placeholder="45, A:67, …"
        onChange={e => updateRule(rule.id, { residues: e.target.value })}
        title="Comma-separated residue numbers or chain:number pairs, e.g. '45, A:67'"
        style={{
          flex: 1, minWidth: 0,
          fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
          color: 'var(--color-text-primary)',
          background: 'var(--color-background)',
          border: '1px solid var(--color-border)',
          borderRadius: 4,
          padding: '2px 5px',
          outline: 'none',
        }}
      />

      {/* ANY / ALL toggle */}
      <button
        onClick={() => updateRule(rule.id, { mode: rule.mode === 'any' ? 'all' : 'any' })}
        title={rule.mode === 'any' ? 'ANY: at least one residue must be present — click to require ALL' : 'ALL: every residue must be present — click to require ANY'}
        style={{
          fontSize: 10, fontWeight: 700,
          padding: '2px 5px',
          borderRadius: 4,
          border: '1px solid var(--color-border)',
          background: 'transparent',
          color: 'var(--color-text-secondary)',
          cursor: 'pointer',
          flexShrink: 0,
          letterSpacing: '0.05em',
        }}
      >
        {rule.mode === 'any' ? 'ANY' : 'ALL'}
      </button>

      {/* No batch data warning */}
      {!hasBatchData && (
        <span
          title="Run batch interface calculation first"
          style={{ fontSize: 10, color: '#f87171', flexShrink: 0 }}
        >⚠</span>
      )}

      {/* Remove */}
      <button
        onClick={() => removeRule(rule.id)}
        title="Remove rule"
        style={{
          width: 18, height: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 3, border: 'none', background: 'none',
          color: 'var(--color-text-disabled)', cursor: 'pointer',
          fontSize: 13, flexShrink: 0, padding: 0,
        }}
      >×</button>
    </div>
  )
}

// ─── Liability filter rule row ────────────────────────────────────────────────

const SEVERITY_COLOR: Record<Severity, string> = {
  high:   '#f87171',
  medium: '#f59e0b',
  low:    'var(--color-text-disabled)',
}

// Default open categories (highest-risk)
const DEFAULT_OPEN_CATEGORIES = new Set<LiabilityCategory>(['deamidation', 'isomerization'])

function LiabilityRuleRow({ rule }: { rule: LiabilityFilterRule }) {
  const { updateRule, removeRule } = useFilterStore.getState()
  const binderChains  = useInterfaceStore(s => s.binderChains)
  const hasCdr        = useAntpackStore(s => s.annotations.size > 0)
  const hasExposure   = useSequenceStore(s => {
    for (const chains of s.sequences.values()) {
      if (chains.some(c => c.exposedMask !== undefined)) return true
    }
    return false
  })

  const [openCats, setOpenCats]           = useState<Set<LiabilityCategory>>(DEFAULT_OPEN_CATEGORIES)
  const [customInput, setCustomInput]     = useState('')
  const [customError, setCustomError]     = useState(false)
  const [infoFor, setInfoFor]             = useState<string | null>(null)

  const toggleCat = (cat: LiabilityCategory) =>
    setOpenCats(s => { const n = new Set(s); n.has(cat) ? n.delete(cat) : n.add(cat); return n })

  const togglePreset = (id: string) => {
    const next = rule.presets.includes(id)
      ? rule.presets.filter(p => p !== id)
      : [...rule.presets, id]
    updateRule(rule.id, { presets: next })
  }

  const addCustom = () => {
    const v = customInput.trim()
    if (!v) return
    if (!customPatternToRegex(v)) { setCustomError(true); return }
    setCustomError(false)
    setCustomInput('')
    updateRule(rule.id, { customPatterns: [...rule.customPatterns, v] })
  }

  const removeCustom = (p: string) =>
    updateRule(rule.id, { customPatterns: rule.customPatterns.filter(c => c !== p) })

  const openExternal = (url: string) => window.electronAPI?.openExternal?.(url)

  const infoPreset = infoFor ? LIABILITY_PRESETS.find(p => p.id === infoFor) : null

  const selStyle: React.CSSProperties = {
    fontSize: 11,
    fontFamily: 'Outfit, sans-serif',
    color: 'var(--color-text-primary)',
    background: 'var(--color-background)',
    border: '1px solid var(--color-border)',
    borderRadius: 4,
    padding: '2px 18px 2px 5px',
    outline: 'none',
    cursor: 'pointer',
  }

  return (
    <div style={{
      padding: '6px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      borderBottom: '1px solid var(--color-border)',
    }}>

      {/* ── Header row ─── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)', flex: 1 }}>
          Sequence Liabilities
        </span>
        <button
          onClick={() => removeRule(rule.id)}
          title="Remove rule"
          style={{
            width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 3, border: 'none', background: 'none',
            color: 'var(--color-text-disabled)', cursor: 'pointer', fontSize: 13, padding: 0,
          }}
        >×</button>
      </div>

      {/* ── Chain mode + scope options ─── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <select
          value={rule.chainMode}
          onChange={e => updateRule(rule.id, { chainMode: e.target.value as 'binder' | 'all' })}
          style={{ ...selStyle }}
          title="Which chains to check for liabilities"
        >
          <option value="binder">Binder chains</option>
          <option value="all">All chains</option>
        </select>

        {rule.chainMode === 'binder' && binderChains.length === 0 && (
          <span style={{ fontSize: 10, color: '#f87171' }} title="Set binder chains in Interface panel">
            ⚠ No binder set
          </span>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: hasCdr ? 'var(--color-text-secondary)' : 'var(--color-text-disabled)', cursor: hasCdr ? 'pointer' : 'default', userSelect: 'none' }}
          title={hasCdr ? 'Only flag matches within CDR positions' : 'Run AntPack numbering first'}>
          <input
            type="checkbox"
            checked={rule.cdrOnly}
            disabled={!hasCdr}
            onChange={e => updateRule(rule.id, { cdrOnly: e.target.checked })}
            style={{ accentColor: 'var(--color-accent)', cursor: hasCdr ? 'pointer' : 'default' }}
          />
          CDR only
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: hasExposure ? 'var(--color-text-secondary)' : 'var(--color-text-disabled)', cursor: hasExposure ? 'pointer' : 'default', userSelect: 'none' }}
          title={hasExposure ? 'Only flag solvent-exposed positions' : 'Load structure annotations first'}>
          <input
            type="checkbox"
            checked={rule.exposedOnly}
            disabled={!hasExposure}
            onChange={e => updateRule(rule.id, { exposedOnly: e.target.checked })}
            style={{ accentColor: 'var(--color-accent)', cursor: hasExposure ? 'pointer' : 'default' }}
          />
          Exposed only
        </label>
      </div>

      {/* ── Preset categories ─── */}
      {LIABILITY_CATEGORIES.map(cat => {
        const catPresets = LIABILITY_PRESETS.filter(p => p.category === cat)
        const open       = openCats.has(cat)
        return (
          <div key={cat}>
            <button
              onClick={() => toggleCat(cat)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, width: '100%',
                background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
                color: 'var(--color-text-secondary)', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
              }}
            >
              <span style={{ fontSize: 8 }}>{open ? '▾' : '▶'}</span>
              {CATEGORY_LABELS[cat]}
            </button>

            {open && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 8px', paddingLeft: 10, paddingTop: 2 }}>
                {catPresets.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <label style={{
                      display: 'flex', alignItems: 'center', gap: 3,
                      fontSize: 11, color: 'var(--color-text-primary)',
                      cursor: 'pointer', userSelect: 'none',
                    }}>
                      <input
                        type="checkbox"
                        checked={rule.presets.includes(p.id)}
                        onChange={() => togglePreset(p.id)}
                        style={{ accentColor: 'var(--color-accent)', cursor: 'pointer' }}
                      />
                      {p.id}
                      <span style={{ color: SEVERITY_COLOR[p.severity], fontSize: 9 }}>●</span>
                    </label>
                    <button
                      onClick={() => setInfoFor(infoFor === p.id ? null : p.id)}
                      title={p.description}
                      style={{
                        width: 14, height: 14, borderRadius: '50%', border: '1px solid var(--color-border)',
                        background: infoFor === p.id ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'none',
                        color: 'var(--color-text-disabled)', cursor: 'pointer',
                        fontSize: 9, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >i</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* ── Info popover ─── */}
      {infoPreset && (
        <div style={{
          background: 'var(--color-secondary-bg)', border: '1px solid var(--color-border)',
          borderRadius: 6, padding: '8px 10px', fontSize: 11, lineHeight: 1.5,
          color: 'var(--color-text-secondary)',
        }}>
          <p style={{ margin: '0 0 6px', color: 'var(--color-text-primary)', fontWeight: 600 }}>{infoPreset.name}</p>
          <p style={{ margin: '0 0 6px' }}>{infoPreset.description}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {infoPreset.links.map(l => (
              <button
                key={l.url}
                onClick={() => openExternal(l.url)}
                style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 3,
                  border: '1px solid var(--color-border)', background: 'none',
                  color: 'var(--color-accent)', cursor: 'pointer',
                }}
              >{l.label}</button>
            ))}
          </div>
        </div>
      )}

      {/* ── Custom patterns ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            type="text"
            value={customInput}
            placeholder="Custom pattern (e.g. AxC)"
            onChange={e => { setCustomInput(e.target.value); setCustomError(false) }}
            onKeyDown={e => { if (e.key === 'Enter') addCustom() }}
            title="AxC = A, any amino acid, C.  AxxC = A, two amino acids, C."
            style={{
              flex: 1, fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
              color: 'var(--color-text-primary)', background: 'var(--color-background)',
              border: `1px solid ${customError ? '#f87171' : 'var(--color-border)'}`,
              borderRadius: 4, padding: '2px 5px', outline: 'none',
            }}
          />
          <SmallBtn onClick={addCustom} variant="accent">+ Add</SmallBtn>
        </div>
        {customError && (
          <span style={{ fontSize: 10, color: '#f87171' }}>Invalid pattern</span>
        )}
        {rule.customPatterns.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {rule.customPatterns.map(p => (
              <span key={p} style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
                padding: '1px 6px', borderRadius: 3,
                border: '1px solid var(--color-border)',
                background: 'var(--color-secondary-bg)',
                color: 'var(--color-text-primary)',
              }}>
                {p}
                <button
                  onClick={() => removeCustom(p)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    color: 'var(--color-text-disabled)', fontSize: 12, lineHeight: 1,
                  }}
                >×</button>
              </span>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}

// ─── Filter rule row dispatcher ───────────────────────────────────────────────

function FilterRuleRow({ rule, allColumns }: { rule: FilterRule; allColumns: string[] }) {
  if (rule.type === 'residue')   return <ResidueRuleRow rule={rule} />
  if (rule.type === 'liability') return <LiabilityRuleRow rule={rule} />
  return <NumericRuleRow rule={rule} allColumns={allColumns} />
}

// ─── Ranking metric row ───────────────────────────────────────────────────────

function RankingMetricRow({ rm, mode }: { rm: RankingMetric; mode: RankingMode }) {
  const { updateRankingMetric } = useFilterStore.getState()
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '2px 12px',
      opacity: rm.active ? 1 : 0.45,
    }}>
      {/* Active checkbox */}
      <input
        type="checkbox"
        checked={rm.active}
        onChange={e => updateRankingMetric(rm.metric, { active: e.target.checked })}
        style={{ accentColor: 'var(--color-accent)', cursor: 'pointer', flexShrink: 0 }}
      />

      {/* Metric name */}
      <span style={{
        flex: 1,
        fontSize: 11,
        color: 'var(--color-text-primary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        minWidth: 0,
      }}>
        {shortLabel(rm.metric)}
      </span>

      {/* Weight slider — weighted-sum only */}
      {mode === 'weighted-sum' && (
        <>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={rm.weight}
            disabled={!rm.active}
            onChange={e => updateRankingMetric(rm.metric, { weight: parseFloat(e.target.value) })}
            style={{ width: 52, cursor: 'pointer', accentColor: 'var(--color-accent)', flexShrink: 0 }}
          />
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={rm.weight.toFixed(2)}
            disabled={!rm.active}
            onChange={e => {
              const v = Math.min(1, Math.max(0, parseFloat(e.target.value) || 0))
              updateRankingMetric(rm.metric, { weight: v })
            }}
            style={{
              width: 42,
              fontSize: 10,
              fontFamily: 'JetBrains Mono, monospace',
              color: 'var(--color-text-secondary)',
              background: 'transparent',
              border: '1px solid var(--color-border)',
              borderRadius: 3,
              textAlign: 'right',
              padding: '1px 3px',
              flexShrink: 0,
            }}
          />
        </>
      )}

      {/* Direction toggle */}
      <button
        onClick={() => updateRankingMetric(rm.metric, { direction: rm.direction === 'max' ? 'min' : 'max' })}
        title={rm.direction === 'max' ? 'Maximise (higher is better) — click to flip' : 'Minimise (lower is better) — click to flip'}
        disabled={!rm.active}
        style={{
          fontSize: 10,
          padding: '1px 5px',
          borderRadius: 3,
          border: '1px solid var(--color-border)',
          background: rm.active ? 'color-mix(in srgb, var(--color-accent) 8%, transparent)' : 'transparent',
          color: rm.active ? 'var(--color-accent)' : 'var(--color-text-disabled)',
          cursor: rm.active ? 'pointer' : 'default',
          flexShrink: 0,
        }}
      >
        {rm.direction === 'max' ? '▲' : '▼'}
      </button>
    </div>
  )
}

// ─── Preset row ───────────────────────────────────────────────────────────────

function PresetRow({ preset }: { preset: { id: string; name: string } }) {
  const { loadPreset, deletePreset, exportPresetJSON } = useFilterStore.getState()

  const downloadPreset = () => {
    downloadBlob(exportPresetJSON(preset.id), `${preset.name.replace(/\s+/g, '_')}.json`, 'application/json')
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '3px 12px',
    }}>
      <span style={{
        flex: 1,
        fontSize: 11,
        color: 'var(--color-text-primary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        minWidth: 0,
      }}>
        {preset.name}
      </span>
      <SmallBtn onClick={() => loadPreset(preset.id)} title="Load this preset">Load</SmallBtn>
      <SmallBtn onClick={downloadPreset} title="Export preset as JSON">↓</SmallBtn>
      <SmallBtn onClick={() => deletePreset(preset.id)} title="Delete preset" variant="danger">×</SmallBtn>
    </div>
  )
}

// ─── Mode toggle button ───────────────────────────────────────────────────────

function ModeBtn({
  value, label, current, onSelect,
}: {
  value: RankingMode
  label: string
  current: RankingMode
  onSelect: (m: RankingMode) => void
}) {
  const active = current === value
  return (
    <button
      onClick={() => onSelect(value)}
      style={{
        fontSize: 10,
        padding: '2px 10px',
        borderRadius: 4,
        border: active
          ? '1px solid color-mix(in srgb, var(--color-accent) 50%, transparent)'
          : '1px solid var(--color-border)',
        background: active
          ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)'
          : 'transparent',
        color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {label}
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FilterPanel() {
  // Subscribe only to DATA — these need to trigger re-renders when they change.
  const rules                   = useFilterStore(s => s.rules)
  const rankingMode             = useFilterStore(s => s.rankingMode)
  const rankingMetrics          = useFilterStore(s => s.rankingMetrics)
  const showFilteredInBrowser   = useFilterStore(s => s.showFilteredInBrowser)
  const presets                 = useFilterStore(s => s.presets)

  const rows       = useMetricsStore(s => s.rows)
  const allColumns = useMetricsStore(s => s.allColumns)

  // Actions are stable references — no reactive subscription needed.
  const {
    addRule, addResidueRule, addLiabilityRule, clearRules, setRankingMode, syncRankingMetrics,
    toggleShowFilteredInBrowser, savePreset, importPresetJSON,
  } = useFilterStore.getState()
  const { injectColumn } = useMetricsStore.getState()

  // Keep ranking metric list in sync with allColumns
  useEffect(() => { syncRankingMetrics(allColumns) }, [allColumns])

  const importFileRef   = useRef<HTMLInputElement>(null)
  const [rankingOpen, setRankingOpen] = useState(false)

  const handleSavePreset = () => {
    const name = window.prompt('Preset name:')
    if (name === null) return
    savePreset(name)
  }

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = ev => importPresetJSON(ev.target?.result as string)
    reader.readAsText(file)
  }

  const handleApplyRanking = () => {
    const scores = computeRankingScores(rows, rankingMode, rankingMetrics)
    if (scores.size === 0) return
    injectColumn('rank_score', scores)
  }

  // Filter out virtual columns from numeric filter rule dropdowns
  const numericColumns = allColumns.filter(c => c !== 'paratope_residues' && c !== 'epitope_residues')

  const activeRuleCount = rules.filter(r => {
    if (r.type === 'residue')   return !!(r.residues?.trim())
    if (r.type === 'liability') return r.presets.length > 0 || r.customPatterns.length > 0
    return !!(r as NumericFilterRule).metric
  }).length
  const activeRankingMetrics = rankingMetrics.filter(m => m.active)
  const activeRankingCount   = activeRankingMetrics.length

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflowY: 'auto',
      background: 'var(--color-background)',
    }}>

      {/* ── Filters section ─────────────────────────────────────────────── */}
      <SectionHeader label="Filters">
        {activeRuleCount > 0 && (
          <span style={{
            fontSize: 10,
            padding: '1px 5px',
            borderRadius: 99,
            background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
            color: 'var(--color-accent)',
            border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
            flexShrink: 0,
          }}>
            {activeRuleCount} active
          </span>
        )}
      </SectionHeader>

      {/* Rule list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, paddingBottom: 4 }}>
        {rules.length === 0 ? (
          <p style={{
            fontSize: 10,
            color: 'var(--color-text-disabled)',
            padding: '4px 12px 8px',
            margin: 0,
          }}>
            No filter rules. Add one below.
          </p>
        ) : (
          rules.map(r => (
            <FilterRuleRow key={r.id} rule={r} allColumns={numericColumns} />
          ))
        )}
      </div>

      {/* Add / Clear buttons */}
      <div style={{ display: 'flex', gap: 6, padding: '0 12px 10px', alignItems: 'center' }}>
        <SmallBtn onClick={addRule} variant="accent">+ Metric</SmallBtn>
        <SmallBtn onClick={addResidueRule} variant="accent">+ Residue</SmallBtn>
        <SmallBtn onClick={addLiabilityRule} variant="accent">+ Liability</SmallBtn>
        {rules.length > 0 && <SmallBtn onClick={clearRules} variant="danger">Clear all</SmallBtn>}
      </div>

      {/* File browser toggle */}
      <div style={{ padding: '0 12px 12px', display: 'flex', alignItems: 'center', gap: 7 }}>
        <input
          type="checkbox"
          id="filter-browser-dim"
          checked={showFilteredInBrowser}
          onChange={toggleShowFilteredInBrowser}
          style={{ accentColor: 'var(--color-accent)', cursor: 'pointer' }}
        />
        <label
          htmlFor="filter-browser-dim"
          style={{ fontSize: 11, color: 'var(--color-text-secondary)', cursor: 'pointer', userSelect: 'none' }}
        >
          Dim filtered files in browser
        </label>
      </div>

      {/* ── Ranking section ──────────────────────────────────────────────── */}

      {/* Clickable header — collapses/expands the config */}
      <button
        onClick={() => setRankingOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px 6px', width: '100%',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'var(--color-text-secondary)',
          whiteSpace: 'nowrap',
        }}>
          Ranking
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
        {activeRankingCount > 0 && (
          <span style={{
            fontSize: 10, padding: '1px 5px', borderRadius: 99,
            background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
            color: 'var(--color-accent)',
            border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
            flexShrink: 0,
          }}>
            {activeRankingCount} active
          </span>
        )}
        {rankingOpen
          ? <ChevronUp size={13} strokeWidth={1.75} style={{ color: 'var(--color-text-disabled)', flexShrink: 0 }} />
          : <ChevronDown size={13} strokeWidth={1.75} style={{ color: 'var(--color-text-disabled)', flexShrink: 0 }} />
        }
      </button>

      {/* Collapsed summary — active metrics listed on one line */}
      {!rankingOpen && activeRankingCount > 0 && (
        <div style={{ padding: '0 12px 8px', display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', flexShrink: 0 }}>
            {rankingMode === 'borda' ? 'Rank sum' : 'Weighted sum'}
          </span>
          <span style={{ fontSize: 10, color: 'var(--color-border)' }}>·</span>
          <span style={{
            fontSize: 10, color: 'var(--color-text-disabled)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {activeRankingMetrics.map(m => shortLabel(m.metric)).join(', ')}
          </span>
        </div>
      )}

      {/* Expanded config */}
      {rankingOpen && (
        <>
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 5, padding: '2px 12px 8px' }}>
            <ModeBtn value="borda"        label="Rank sum"     current={rankingMode} onSelect={setRankingMode} />
            <ModeBtn value="weighted-sum" label="Weighted sum" current={rankingMode} onSelect={setRankingMode} />
          </div>

          {rankingMetrics.length === 0 ? (
            <p style={{ fontSize: 10, color: 'var(--color-text-disabled)', padding: '4px 12px 8px', margin: 0 }}>
              Calculate or import metrics first.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, paddingBottom: 6 }}>
              {rankingMetrics.map(rm => (
                <RankingMetricRow key={rm.metric} rm={rm} mode={rankingMode} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Apply ranking — only shown when metrics are configured */}
      {activeRankingCount > 0 && (
        <div style={{ padding: '0 12px 12px' }}>
          <button
            onClick={handleApplyRanking}
            disabled={rows.length === 0}
            style={{
              fontSize: 11, fontFamily: 'Outfit, sans-serif', fontWeight: 600,
              padding: '4px 14px', borderRadius: 5,
              border: '1px solid color-mix(in srgb, var(--color-accent) 50%, transparent)',
              background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
              color: 'var(--color-accent)',
              cursor: rows.length > 0 ? 'pointer' : 'not-allowed',
              opacity: rows.length > 0 ? 1 : 0.4,
              alignSelf: 'flex-start',
            }}
          >
            Apply Ranking
          </button>
          {rows.some(r => r.metrics['rank_score'] !== undefined) && (
            <p style={{ fontSize: 10, color: 'var(--color-text-disabled)', margin: '4px 0 0' }}>
              rank_score column active in Metrics &amp; Plot
            </p>
          )}
        </div>
      )}

      {/* ── Presets section ──────────────────────────────────────────────── */}
      <SectionHeader label="Presets" />

      <div style={{ display: 'flex', gap: 6, padding: '2px 12px 8px' }}>
        <SmallBtn onClick={handleSavePreset} variant="accent">Save as…</SmallBtn>
        <SmallBtn onClick={() => importFileRef.current?.click()}>Import JSON</SmallBtn>
        <input
          ref={importFileRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleImportFile}
        />
      </div>

      {presets.length === 0 ? (
        <p style={{
          fontSize: 10,
          color: 'var(--color-text-disabled)',
          padding: '2px 12px 12px',
          margin: 0,
        }}>
          No saved presets.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, paddingBottom: 12 }}>
          {presets.map(p => <PresetRow key={p.id} preset={p} />)}
        </div>
      )}

    </div>
  )
}
