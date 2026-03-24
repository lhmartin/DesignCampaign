import { useFileStore } from '@/stores/file-store'
import { useMetricsStore } from '@/stores/metrics-store'
import { useFilterStore } from '@/stores/filter-store'
import { useViewerPrefsStore } from '@/stores/viewer-prefs-store'
import type { RepresentationStyle, ColorScheme } from '@/components/viewer/ViewerControls'
import { getFileName } from '@/lib/utils'

export async function executeTool(name: string, input: unknown): Promise<unknown> {
  const inp = input as Record<string, unknown>

  switch (name) {
    case 'get_loaded_files': {
      const { files, currentFolder } = useFileStore.getState()
      return {
        folder: currentFolder,
        count: files.length,
        files: files.map(f => ({ name: f.name, path: f.path })),
      }
    }

    case 'get_metrics': {
      const filtered = inp.filtered !== false
      const store = useMetricsStore.getState()
      const rows = filtered ? store.getFilteredRows() : store.rows
      return {
        total: store.rows.length,
        filtered: rows.length,
        columns: store.allColumns,
        rows: rows.map(r => ({ name: r.name, ...r.metrics })),
      }
    }

    case 'get_filter_rules': {
      const { rules, rankingMode, rankingMetrics } = useFilterStore.getState()
      return { rules, rankingMode, activeRankingMetrics: rankingMetrics.filter(m => m.active) }
    }

    case 'add_filter': {
      const column = inp.column as string
      const operator = inp.operator as string
      const value = inp.value as number
      const store = useFilterStore.getState()
      store.addRule()
      // Zustand updates synchronously; grab the newly-added rule (last in array)
      const updatedRules = useFilterStore.getState().rules
      const newRule = updatedRules[updatedRules.length - 1]
      store.updateRule(newRule.id, { metric: column, op: operator as '>' | '>=' | '<' | '<=' | '=', value })
      return { added: { column, operator, value } }
    }

    case 'clear_filters': {
      useFilterStore.getState().clearRules()
      return { cleared: true }
    }

    case 'configure_ranking': {
      const mode = (inp.mode as string | undefined) ?? 'weighted-sum'
      const metrics = inp.metrics as Array<{ column: string; direction: 'maximize' | 'minimize'; weight?: number }>
      const store = useFilterStore.getState()
      store.setRankingMode(mode as 'borda' | 'weighted-sum')
      // Ensure all requested columns exist in rankingMetrics before updating them
      store.syncRankingMetrics(metrics.map(m => m.column))
      for (const m of metrics) {
        store.updateRankingMetric(m.column, {
          active: true,
          direction: m.direction === 'maximize' ? 'max' : 'min',
          weight: m.weight ?? 0.5,
        })
      }
      return { mode, configured: metrics.map(m => m.column) }
    }

    case 'set_viewer_style': {
      const store = useViewerPrefsStore.getState()
      if (inp.style) store.setStyle(inp.style as RepresentationStyle)
      if (inp.colorScheme) store.setColorScheme(inp.colorScheme as ColorScheme)
      return { style: inp.style ?? 'unchanged', colorScheme: inp.colorScheme ?? 'unchanged' }
    }

    case 'load_structure': {
      const filePath = inp.filePath as string
      useViewerPrefsStore.getState().requestLoadFile(filePath)
      return { loading: getFileName(filePath) }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}
