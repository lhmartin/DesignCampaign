import type Anthropic from '@anthropic-ai/sdk'
import { useFileStore } from '@/stores/file-store'
import { useMetricsStore } from '@/stores/metrics-store'
import { useFilterStore } from '@/stores/filter-store'
import { useViewerPrefsStore } from '@/stores/viewer-prefs-store'

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_loaded_files',
    description: 'Get all structure files currently loaded in the folder browser, with their names and file paths.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_metrics',
    description: 'Get the metrics table. Returns rows with all computed metrics (pLDDT, RMSD, interface area, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        filtered: {
          type: 'boolean',
          description: 'If true, returns only rows that pass the currently active filters. Default: true.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_filter_rules',
    description: 'Get the currently active filter rules.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'add_filter',
    description: 'Add a numeric filter rule to the metrics table. For example: add a filter to keep only structures with pLDDT >= 80.',
    input_schema: {
      type: 'object',
      properties: {
        column: { type: 'string', description: 'The metric column name (e.g. "pLDDT", "rmsd", "interface_area")' },
        operator: { type: 'string', enum: ['>=', '>', '<=', '<', '='], description: 'Comparison operator' },
        value: { type: 'number', description: 'Threshold value' },
      },
      required: ['column', 'operator', 'value'],
    },
  },
  {
    name: 'clear_filters',
    description: 'Remove all active filter rules, showing all structures in the metrics table.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'configure_ranking',
    description: 'Set up a ranking configuration. Activates specified metrics with given directions and weights, and sets the ranking mode.',
    input_schema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['borda', 'weighted-sum'],
          description: '"weighted-sum" uses weights; "borda" treats all equally. Default: weighted-sum.',
        },
        metrics: {
          type: 'array',
          description: 'Metrics to rank by.',
          items: {
            type: 'object',
            properties: {
              column: { type: 'string', description: 'Metric column name' },
              direction: { type: 'string', enum: ['maximize', 'minimize'], description: 'Whether higher or lower values are better' },
              weight: { type: 'number', description: 'Weight 0–1, used in weighted-sum mode. Defaults to 0.5.' },
            },
            required: ['column', 'direction'],
          },
        },
      },
      required: ['metrics'],
    },
  },
  {
    name: 'set_viewer_style',
    description: 'Change the 3D structure viewer representation style and/or colour scheme.',
    input_schema: {
      type: 'object',
      properties: {
        style: {
          type: 'string',
          enum: ['cartoon', 'ball-and-stick', 'spacefill', 'line', 'gaussian-surface', 'putty', 'backbone', 'molecular-surface'],
        },
        colorScheme: {
          type: 'string',
          enum: ['chain-id', 'hydrophobicity', 'plddt-bands', 'interface', 'named-selections', 'rmsd-deviation', 'sequence-id'],
        },
      },
      required: [],
    },
  },
  {
    name: 'load_structure',
    description: 'Load a specific structure file in the 3D viewer. Use get_loaded_files to find available file paths.',
    input_schema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Full file path of the structure to load.' },
      },
      required: ['filePath'],
    },
  },
]

// ── System prompt ──────────────────────────────────────────────────────────────

export function buildSystemPrompt(): string {
  const { files, currentFolder, activeFile } = useFileStore.getState()
  const { allColumns } = useMetricsStore.getState()
  const { rules, rankingMode, rankingMetrics } = useFilterStore.getState()
  const { style, colorScheme } = useViewerPrefsStore.getState()

  const folderLine = currentFolder ? `Folder: ${currentFolder} (${files.length} files loaded)` : 'No folder open.'
  const activeLine = activeFile ? `Active structure: ${activeFile.split('/').pop()?.split('\\').pop()}` : 'No structure loaded.'
  const columnsLine = allColumns.length > 0 ? `Available metric columns: ${allColumns.join(', ')}` : 'No metrics computed yet.'
  const filtersLine = rules.length > 0
    ? `Active filters (${rules.length}): ${rules.filter(r => r.type === 'numeric').map(r => `${(r as { metric: string }).metric} ${(r as { op: string }).op} ${(r as { value: number }).value}`).join('; ')}`
    : 'No active filters.'
  const rankingLine = rankingMetrics.filter(m => m.active).length > 0
    ? `Ranking (${rankingMode}): ${rankingMetrics.filter(m => m.active).map(m => `${m.metric} ${m.direction}`).join(', ')}`
    : 'No ranking configured.'
  const viewerLine = `Viewer: ${style} / ${colorScheme}`

  return `You are an assistant built into DesignCampaign, a protein structure analysis tool for antibody design campaigns.

Current app state:
- ${folderLine}
- ${activeLine}
- ${columnsLine}
- ${filtersLine}
- ${rankingLine}
- ${viewerLine}

You can use tools to read data, apply filters, configure ranking, change the viewer, and load structures. Be concise. Use markdown tables or lists when presenting structured data.`
}
