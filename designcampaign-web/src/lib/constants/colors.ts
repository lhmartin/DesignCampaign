// 10 rotating colors for multi-chain display (matplotlib tab10 palette)
export const CHAIN_COLORS = [
  '#1f77b4',  // blue
  '#ff7f0e',  // orange
  '#2ca02c',  // green
  '#d62728',  // red
  '#9467bd',  // purple
  '#8c564b',  // brown
  '#e377c2',  // pink
  '#7f7f7f',  // gray
  '#bcbd22',  // olive
  '#17becf',  // cyan
] as const

// Secondary structure colors (ssJmol scheme)
export const SECONDARY_STRUCTURE_COLORS = {
  helix: '#ff0080',  // magenta/hot pink
  sheet: '#ffc800',  // golden yellow
  coil:  '#ffffff',  // white
} as const

// pLDDT confidence thresholds (AlphaFold)
export const PLDDT_THRESHOLDS = {
  very_high: 90,  // Very high confidence (blue)
  confident: 70,  // Confident (cyan)
  low:       50,  // Low confidence (yellow)
  very_low:   0,  // Very low confidence (orange)
} as const

// Light theme color palette
export const LIGHT_THEME = {
  background:           '#ffffff',
  foreground:           '#000000',
  secondaryBackground:  '#f5f5f5',
  border:               '#cccccc',
  plotBackground:       '#ffffff',
  plotForeground:       '#000000',
  plotGrid:             '#e0e0e0',
  tableAlternateRow:    '#f8f8f8',
  tableHeaderBackground:'#e8e8e8',
  accent:               '#0078d4',
  accentHover:          '#106ebe',
  textPrimary:          '#000000',
  textSecondary:        '#666666',
  textDisabled:         '#999999',
  viewerBackground:     '#ffffff',
} as const

// Dark theme color palette
export const DARK_THEME = {
  background:           '#1e1e1e',
  foreground:           '#d4d4d4',
  secondaryBackground:  '#252526',
  border:               '#3c3c3c',
  plotBackground:       '#252526',
  plotForeground:       '#d4d4d4',
  plotGrid:             '#3c3c3c',
  tableAlternateRow:    '#2d2d2d',
  tableHeaderBackground:'#333333',
  accent:               '#0078d4',
  accentHover:          '#1c97ea',
  textPrimary:          '#d4d4d4',
  textSecondary:        '#9d9d9d',
  textDisabled:         '#6d6d6d',
  viewerBackground:     '#1e1e1e',
} as const

// Color gradient functions for B-factor, hydrophobicity, metric coloring

export function lerpColor(
  t: number,
  c1: [number, number, number],
  c2: [number, number, number]
): string {
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * t)
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * t)
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * t)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/** Red-White-Blue gradient. 0 = blue, 0.5 = white, 1 = red. */
export function gradientRWB(norm: number): string {
  const t = Math.max(0, Math.min(1, norm))
  if (t < 0.5) return lerpColor(t * 2, [0, 0, 255], [255, 255, 255])
  return lerpColor((t - 0.5) * 2, [255, 255, 255], [255, 0, 0])
}

/** Blue-White-Red gradient. 0 = red, 0.5 = white, 1 = blue. */
export function gradientBWR(norm: number): string {
  const t = Math.max(0, Math.min(1, norm))
  if (t < 0.5) return lerpColor(t * 2, [255, 0, 0], [255, 255, 255])
  return lerpColor((t - 0.5) * 2, [255, 255, 255], [0, 0, 255])
}

/** Simplified viridis-like gradient. Purple → Teal → Yellow. */
export function gradientViridis(norm: number): string {
  const t = Math.max(0, Math.min(1, norm))
  if (t < 0.5) return lerpColor(t * 2, [68, 1, 84], [32, 145, 140])
  return lerpColor((t - 0.5) * 2, [32, 145, 140], [253, 231, 37])
}
