/**
 * Colour utilities for the alignment viewer.
 * ClustalX-inspired scheme grouped by chemical property.
 */

// ── ClustalX amino-acid colour map ────────────────────────────────────────────

// Returns a CSS background colour string for a given single-letter amino acid code.
// Gaps ('-') return transparent.
export function clustalColor(aa: string, dark: boolean): string {
  switch (aa.toUpperCase()) {
    // Hydrophobic (non-polar aliphatic)
    case 'A': case 'V': case 'I': case 'L': case 'M':
      return dark ? 'rgba(255,165,0,0.45)' : 'rgba(240,140,0,0.35)'
    // Aromatic
    case 'F': case 'W': case 'Y':
      return dark ? 'rgba(0,210,210,0.40)' : 'rgba(0,180,180,0.35)'
    // Positive
    case 'K': case 'R': case 'H':
      return dark ? 'rgba(60,120,255,0.50)' : 'rgba(30,90,220,0.35)'
    // Negative
    case 'D': case 'E':
      return dark ? 'rgba(255,60,60,0.50)' : 'rgba(210,30,30,0.35)'
    // Polar / hydroxyl
    case 'S': case 'T': case 'N': case 'Q':
      return dark ? 'rgba(50,210,90,0.45)' : 'rgba(20,170,60,0.35)'
    // Cysteine
    case 'C':
      return dark ? 'rgba(255,220,80,0.50)' : 'rgba(220,180,0,0.40)'
    // Glycine
    case 'G':
      return dark ? 'rgba(200,200,200,0.30)' : 'rgba(140,140,140,0.30)'
    // Proline
    case 'P':
      return dark ? 'rgba(210,100,255,0.45)' : 'rgba(170,60,210,0.35)'
    default:
      return 'transparent'
  }
}

// Text colour — slightly muted in gaps/unknowns, normal otherwise
export function cellTextColor(aa: string, dark: boolean): string {
  if (aa === '-' || aa === '.') return dark ? 'rgba(100,130,180,0.40)' : 'rgba(160,170,190,0.60)'
  return dark ? 'rgba(220,230,250,0.95)' : 'rgba(20,30,50,0.90)'
}

// ── Conservation scoring ───────────────────────────────────────────────────────

/**
 * For each column position in an alignment, returns a score in [0, 1]:
 * 1.0 = fully conserved, 0.0 = completely variable.
 * Uses the fraction of non-gap positions that match the plurality residue.
 */
export function columnConservation(aligned: string[]): number[] {
  if (aligned.length === 0) return []
  const colLen = aligned[0].length
  const scores = new Float32Array(colLen)

  for (let col = 0; col < colLen; col++) {
    const counts: Record<string, number> = {}
    let total = 0
    for (const seq of aligned) {
      const aa = seq[col]
      if (!aa || aa === '-') continue
      counts[aa] = (counts[aa] ?? 0) + 1
      total++
    }
    if (total === 0) { scores[col] = 0; continue }
    const max = Math.max(...Object.values(counts))
    scores[col] = max / total
  }

  return Array.from(scores)
}

/**
 * Maps a conservation score [0,1] to a CSS colour.
 * High conservation → strong green; low → transparent.
 */
export function conservationColor(score: number, dark: boolean): string {
  if (score < 0.4) return 'transparent'
  const alpha = (score - 0.4) / 0.6   // remap 0.4–1.0 to 0–1
  if (dark) return `rgba(0,210,100,${(0.15 + alpha * 0.55).toFixed(2)})`
  return `rgba(0,150,70,${(0.12 + alpha * 0.45).toFixed(2)})`
}
