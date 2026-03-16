import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ComparisonOp = '>' | '>=' | '<' | '<=' | '='

export interface FilterRule {
  id: string
  metric: string
  op: ComparisonOp
  value: number
}

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

// ─── Store interface ──────────────────────────────────────────────────────────

interface FilterStore {
  // Filter rules
  rules: FilterRule[]
  addRule: () => void
  updateRule: (id: string, patch: Partial<FilterRule>) => void
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
  passesFilters: (metrics: Record<string, number>) => boolean
}

// ─── Store ────────────────────────────────────────────────────────────────────

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
          metric: '',
          op: '>=' as ComparisonOp,
          value: 0,
        }],
      })),

      updateRule: (id, patch) => set(s => ({
        rules: s.rules.map(r => r.id === id ? { ...r, ...patch } : r),
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
          .filter(c => !existing.has(c))
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

      passesFilters: (metrics) => {
        const { rules } = get()
        if (rules.length === 0) return true
        return rules.every(r => {
          if (!r.metric) return true               // blank rule → pass
          const v = metrics[r.metric]
          if (v === undefined) return true         // no data → pass (don't penalise missing)
          switch (r.op) {
            case '>':  return v >  r.value
            case '>=': return v >= r.value
            case '<':  return v <  r.value
            case '<=': return v <= r.value
            case '=':  return v === r.value
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
