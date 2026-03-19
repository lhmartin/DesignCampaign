/**
 * Shared Plotly colour tokens for dark and light mode.
 * Used by ScatterPlot, CorrelationHeatmap, and any future Plotly-based component.
 */

export const PLOTLY_DARK = {
  paper:    'transparent',
  plot:     'rgba(255,255,255,0.04)',
  grid:     'rgba(160,185,230,0.20)',
  line:     'rgba(160,185,230,0.35)',
  tick:     '#8faac8',
  font:     '#b0c8e4',
  dot:      '#00e8c0',
  dim:      'rgba(100,130,180,0.25)',
  hover:    'rgba(18,24,52,0.96)',
  hoverTxt: '#c4d4ec',
  border:   'rgba(0,220,180,0.35)',
}

export const PLOTLY_LIGHT = {
  paper:    'transparent',
  plot:     'rgba(242,245,251,0.0)',
  grid:     'rgba(208,216,236,0.9)',
  line:     'rgba(208,216,236,1)',
  tick:     '#4a607c',
  font:     '#4a607c',
  dot:      '#0068c8',
  dim:      'rgba(208,216,236,0.6)',
  hover:    '#ffffff',
  hoverTxt: '#111827',
  border:   'rgba(0,104,200,0.25)',
}

export type PlotlyTheme = typeof PLOTLY_DARK
