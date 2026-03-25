import { useEffect, useRef, useState } from 'react'
import { useFileStore } from '@/stores/file-store'
import { useFilterStore } from '@/stores/filter-store'
import { useMetricsStore } from '@/stores/metrics-store'

interface MarimoContextPaths {
  contextPath: string | null
  metricsPath: string | null
}

/**
 * Watches app state and writes a dc_context.json + marimo_metrics.csv to the
 * userData directory whenever state changes (debounced 500 ms).
 * Pass `enabled=false` when Marimo is not running to suppress unnecessary writes.
 * Returns the paths so the MarimoTab toolbar can display them.
 */
export function useMarimoContext(enabled: boolean): MarimoContextPaths {
  const [paths, setPaths] = useState<MarimoContextPaths>({ contextPath: null, metricsPath: null })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeFile = useFileStore(s => s.activeFile)
  const currentFolder = useFileStore(s => s.currentFolder)
  const files = useFileStore(s => s.files)
  const rules = useFilterStore(s => s.rules)
  const rankingMode = useFilterStore(s => s.rankingMode)
  const rankingMetrics = useFilterStore(s => s.rankingMetrics)
  const rows = useMetricsStore(s => s.rows)

  useEffect(() => {
    if (!enabled || !window.electronAPI) return

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      const passesFilters = useFilterStore.getState().passesFilters

      // If no metrics exist yet, expose all files from the browser.
      // Once metrics are loaded, apply filters so Marimo sees the same subset as the table.
      const filteredRows = rows.length === 0
        ? []
        : rows.filter(r => passesFilters(r.metrics, r.filePath))

      const filteredFiles = rows.length === 0
        ? files.map(f => f.path)
        : filteredRows.map(r => r.filePath).filter((p): p is string => p !== null)

      try {
        const result = await window.electronAPI.marimoUpdateContext({
          active_file: activeFile,
          current_folder: currentFolder,
          filtered_files: filteredFiles,
          filters: rules,
          ranking_mode: rankingMode,
          ranking_metrics: rankingMetrics,
          metricsRows: filteredRows,
        })
        setPaths({ contextPath: result.contextPath, metricsPath: result.metricsPath })
      } catch { /* silently ignore — marimo context is best-effort */ }
    }, 500)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [enabled, activeFile, currentFolder, files, rules, rankingMode, rankingMetrics, rows])

  return paths
}
