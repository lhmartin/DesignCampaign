export const APP_DEFAULTS = {
  SUPPORTED_FORMATS: ['.pdb', '.cif', '.mmcif'] as const,
  DEFAULT_WINDOW_WIDTH: 1200,
  DEFAULT_WINDOW_HEIGHT: 800,
  LEFT_PANEL_RATIO: 0.25,
  DEFAULT_VIEWER_STYLE: 'cartoon',
  DEFAULT_COLOR_SCHEME: 'spectrum',
  DEFAULT_BACKGROUND_COLOR: '#ffffff',
  MAX_FILE_SIZE_WARNING: 100 * 1024 * 1024,  // 100 MB
  DEFAULT_INTERFACE_CUTOFF: 4.0,              // Angstroms
  MAX_COMPARISON_STRUCTURES: 4,               // Primary + 3 comparison
  SEQUENCE_HASH_LENGTH: 12,                   // First 12 hex chars of MD5
  CACHE_VERSION: 1,
} as const

export interface UserConfig {
  filters: {
    metric_ranges: Record<string, [number | null, number | null]>
  }
  viewer: {
    cell_size: 'small' | 'medium' | 'large'
    color_scheme: string
    representation: string
    interface_cutoff: number
    dark_mode: boolean
    collapsed_sections: Record<string, boolean>
    hidden_columns: string[]
  }
  last_folder: string | null
  window_geometry: {
    x: number
    y: number
    width: number
    height: number
  } | null
}

export const DEFAULT_CONFIG: UserConfig = {
  filters: { metric_ranges: {} },
  viewer: {
    cell_size: 'large',
    color_scheme: 'spectrum',
    representation: 'cartoon',
    interface_cutoff: 4.0,
    dark_mode: false,
    collapsed_sections: {},
    hidden_columns: [],
  },
  last_folder: null,
  window_geometry: null,
}
