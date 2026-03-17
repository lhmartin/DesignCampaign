import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useBatchInterfaceStore } from './batch-interface-store'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ComparisonOp = '>' | '>=' | '<' | '<=' | '='

export interface NumericFilterRule {
  id: string
  type: 'numeric'
  metric: string
  op: ComparisonOp
  value: number
}

export interface ResidueFilterRule {
  id: string
  type: 'residue'
  target: 'paratope' | 'epitope'
  residues: string
  mode: 'any' | 'all'
}

export type FilterRule = NumericFilterRule | ResidueFilterRule

export type RankingMode = 'borda' | 'weighted-sum'

export interface RankingMetric {
  metric: string
  weight: number       // 0–1, used in weighted-sum mode
  direction: 'max' | 'min'
  active: boolean
}

export interface FilterPreset {
  id: string
  name: string
  rules: FilterRule[]
  rankingMode: RankingMode
  rankingMetrics: RankingMetric[]
}

// ─── Residue matching helpers ─────────────────────────────────────────────────

function parseResidueSpec(spec: string): { chain?: string; resId: number } | null {
  spec = spec.trim()
  if (!spec) return null
  const sep = spec.lastIndexOf(':')
  if (sep > 0 && sep < spec.length - 1) {
    const resId = parseInt(spec.slice(sep + 1), 10)
    return isNaN(resId) ? null : { chain: spec.slice(0, sep), resId }
  }
  const resId = parseInt(spec, 10)
  return isNaN(resId) ? null : { resId }
}

function residueKeyMatches(spec: { chain?: string; resId: number }, key: string): boolean {
  const sep = key.lastIndexOf(':')
  if (spec.chain !== undefined && spec.chain !== key.slice(0, sep)) return false
  return spec.resId === parseInt(key.slice(sep + 1), 10)
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface FilterStore {
  // Filter rules
  rules: FilterRule[]
  addRule: () => void
  addResidueRule: () => void
  updateRule: (id: string, patch: Partial<NumericFilterRule> | Partial<ResidueFilterRule>) => void
  removeRule: (id: string) => void
  clearRules: () => void

  // Ranking
  rankingMode: RankingMode
  rankingMetrics: RankingMetric[]
  setRankingMode: (m: RankingMode) => void
  updateRankingMetric: (metric: string, patch: Partial<RankingMetric>) => void
  /** Called when allColumns expands — adds any new columns (inactive, weight 0.5, max) */
  syncRankingMetrics: (allColumns: string[]) => void

  // File browser integration
  showFilteredInBrowser: boolean
  toggleShowFilteredInBrowser: () => void

  // Presets
  presets: FilterPreset[]
  savePreset: (name: string) => void
  loadPreset: (id: string) => void
  deletePreset: (id: string) => void
  exportPresetJSON: (id: string) => string
  importPresetJSON: (json: string) => void

  // Pure helper — callable outside React
  passesFilters: (metrics: Record<string, number>, filePath?: string | null) => boolean
}

// ─── Store ────────────────────────────────────────────────────────────────────

const VIRTUAL_COLS = new Set(['paratope_residues', 'epitope_residues'])

export const useFilterStore = create<FilterStore>()(
  persist(
    (set, get) => ({
      rules: [],
      rankingMode: 'weighted-sum',
      rankingMetrics: [],
      showFilteredInBrowser: false,
      presets: [],

      // ── Filter rules ──────────────────────────────────────────────────────

      addRule: () => set(s => ({
        rules: [...s.rules, {
          id: crypto.randomUUID(),
          type: 'numeric' as const,
          metric: '',
          op: '>=' as ComparisonOp,
          value: 0,
        }],
      })),

      addResidueRule: () => set(s => ({
        rules: [...s.rules, {
          id: crypto.randomUUID(),
          type: 'residue' as const,
          target: 'paratope' as const,
          residues: '',
          mode: 'any' as const,
        }],
      })),

      updateRule: (id, patch) => set(s => ({
        rules: s.rules.map(r => r.id === id ? { ...r, ...patch } as FilterRule : r),
      })),

      removeRule: (id) => set(s => ({ rules: s.rules.filter(r => r.id !== id) })),

      clearRules: () => set({ rules: [] }),

      // ── Ranking ───────────────────────────────────────────────────────────

      setRankingMode: (rankingMode) => set({ rankingMode }),

      updateRankingMetric: (metric, patch) => set(s => ({
        rankingMetrics: s.rankingMetrics.map(m => m.metric === metric ? { ...m, ...patch } : m),
      })),

      syncRankingMetrics: (allColumns) => {
        const { rankingMetrics } = get()
        const existing = new Set(rankingMetrics.map(m => m.metric))
        const added: RankingMetric[] = allColumns
          .filter(c => !existing.has(c) && !VIRTUAL_COLS.has(c))
          .map(c => ({ metric: c, weight: 0.5, direction: 'max' as const, active: false }))
        if (added.length === 0) return   // nothing new — skip set() to avoid spurious re-renders
        set({ rankingMetrics: [...rankingMetrics, ...added] })
      },

      // ── File browser ──────────────────────────────────────────────────────

      toggleShowFilteredInBrowser: () =>
        set(s => ({ showFilteredInBrowser: !s.showFilteredInBrowser })),

      // ── Presets ───────────────────────────────────────────────────────────

      savePreset: (name) => set(s => ({
        presets: [...s.presets, {
          id: crypto.randomUUID(),
          name: name.trim() || 'Unnamed preset',
          rules: s.rules,
          rankingMode: s.rankingMode,
          rankingMetrics: s.rankingMetrics,
        }],
      })),

      loadPreset: (id) => {
        const preset = get().presets.find(p => p.id === id)
        if (!preset) return
        set({ rules: preset.rules, rankingMode: preset.rankingMode, rankingMetrics: preset.rankingMetrics })
      },

      deletePreset: (id) => set(s => ({ presets: s.presets.filter(p => p.id !== id) })),

      exportPresetJSON: (id) => {
        const preset = get().presets.find(p => p.id === id)
        if (!preset) return '{}'
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, ...exportable } = preset
        return JSON.stringify({ version: 1, ...exportable }, null, 2)
      },

      importPresetJSON: (json) => {
        try {
          const data = JSON.parse(json) as Partial<FilterPreset & { version: number }>
          if (!data.name) return
          set(s => ({
            presets: [...s.presets, {
              id: crypto.randomUUID(),
              name: data.name!,
              rules: Array.isArray(data.rules) ? data.rules : [],
              rankingMode: data.rankingMode ?? 'weighted-sum',
              rankingMetrics: Array.isArray(data.rankingMetrics) ? data.rankingMetrics : [],
            }],
          }))
        } catch (err) {
          if (!(err instanceof SyntaxError)) throw err
          // Silently ignore malformed JSON
        }
      },

      // ── Pure helper ───────────────────────────────────────────────────────

      passesFilters: (metrics, filePath) => {
        const { rules } = get()
        if (rules.length === 0) return true
        return rules.every(r => {
          // Handle legacy persisted rules that have no `type` field — treat as numeric
          const ruleType = (r as FilterRule).type ?? 'numeric'

          if (ruleType === 'residue') {
            const residueRule = r as ResidueFilterRule
            if (!residueRule.residues.trim()) return true
            if (!filePath) return true
            const batchResult = useBatchInterfaceStore.getState().results[filePath]
            if (!batchResult) return true
            const keys = residueRule.target === 'paratope' ? batchResult.paratope : batchResult.epitope
            const specs = residueRule.residues
              .split(',')
              .map(parseResidueSpec)
              .filter((s): s is NonNullable<typeof s> => s !== null)
            if (specs.length === 0) return true
            return residueRule.mode === 'any'
              ? specs.some(spec => keys.some(key => residueKeyMatches(spec, key)))
              : specs.every(spec => keys.some(key => residueKeyMatches(spec, key)))
          }

          // Numeric rule (or legacy rule without type)
          const numericRule = r as NumericFilterRule
          if (!numericRule.metric) return true               // blank rule → pass
          const v = metrics[numericRule.metric]
          if (v === undefined) return true                   // no data → pass
          switch (numericRule.op) {
            case '>':  return v >  numericRule.value
            case '>=': return v >= numericRule.value
            case '<':  return v <  numericRule.value
            case '<=': return v <= numericRule.value
            case '=':  return v === numericRule.value
            default:   return true
          }
        })
      },
    }),
    {
      name: 'dc-filter-store',
      // Only persist data, not functions
      partialize: (s) => ({
        rules:                 s.rules,
        rankingMode:           s.rankingMode,
        rankingMetrics:        s.rankingMetrics,
        showFilteredInBrowser: s.showFilteredInBrowser,
        presets:               s.presets,
      }),
    },
  ),
)
