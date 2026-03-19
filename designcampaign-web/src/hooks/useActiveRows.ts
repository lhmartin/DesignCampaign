import { useMemo } from 'react'
import { type ProteinMetrics } from '@/stores/metrics-store'
import { useFilterStore, type FilterRule, type NumericFilterRule } from '@/stores/filter-store'

/**
 * Returns the subset of `rows` that pass the current filter-store rules and
 * the metrics-store text search — the same "active" set shown in ScatterPlot.
 */
export function useActiveRows(
  rows: ProteinMetrics[],
  filterText: string,
  filterRules: FilterRule[],
): ProteinMetrics[] {
  return useMemo(() => {
    const hasFilters = !!filterText || filterRules.some(r =>
      r.type === 'residue'
        ? !!(r.residues?.trim())
        : !!(r as NumericFilterRule).metric
    )
    if (!hasFilters) return rows
    const { passesFilters } = useFilterStore.getState()
    return rows.filter(r => {
      const textOk = !filterText || r.name.toLowerCase().includes(filterText.toLowerCase())
      return textOk && passesFilters(r.metrics, r.filePath)
    })
  }, [rows, filterText, filterRules])
}
