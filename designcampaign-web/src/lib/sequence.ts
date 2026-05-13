// ─── Amino-acid sequence types & helpers ─────────────────────────────────────

export interface ResidueInfo {
  code: string   // single-letter IUPAC code
  number: number // auth_seq_id from structure
}

export interface ChainSequence {
  chain: string
  residues: ResidueInfo[]
}

// 3-letter → 1-letter mapping (standard + common non-standard)
export const THREE_TO_ONE: Record<string, string> = {
  ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C',
  GLN: 'Q', GLU: 'E', GLY: 'G', HIS: 'H', ILE: 'I',
  LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P',
  SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V',
  // Non-standard
  MSE: 'M', SEC: 'U', PYL: 'O', HYP: 'P',
  // Nucleotides (fall through gracefully)
  DA: 'A', DC: 'C', DG: 'G', DT: 'T', DU: 'U',
  A: 'A', C: 'C', G: 'G', T: 'T', U: 'U',
}

// ─── Kyte-Doolittle hydrophobicity scale ─────────────────────────────────────
export const HYDROPHOBICITY_SCALE: Record<string, number> = {
  I: 4.5, V: 4.2, L: 3.8, F: 2.8, C: 2.5, M: 1.9, A: 1.8,
  G: -0.4, T: -0.7, S: -0.8, W: -0.9, Y: -1.3, P: -1.6, H: -3.2,
  D: -3.5, E: -3.5, N: -3.5, Q: -3.5, K: -3.9, R: -4.5,
}

// ─── Residue color palette ────────────────────────────────────────────────────
// Light-mode fg values must stay ≥4.5:1 on the pale tile tint when the
// surrounding card is white; dark-mode keeps the brighter pastels.
export function residueColor(code: string, isDark: boolean): { bg: string; fg: string } {
  switch (code) {
    // Hydrophobic (non-polar aliphatic + aromatic)
    case 'A': case 'V': case 'I': case 'L': case 'M':
    case 'F': case 'W': case 'P':
      return { bg: 'rgba(255,155,60,0.22)', fg: isDark ? '#ff9e50' : '#7c2d12' }
    // Polar uncharged
    case 'S': case 'T': case 'N': case 'Q': case 'C': case 'Y':
      return { bg: 'rgba(72,200,110,0.20)', fg: isDark ? '#52d080' : '#14532d' }
    // Positively charged
    case 'K': case 'R': case 'H':
      return { bg: 'rgba(80,140,255,0.20)', fg: isDark ? '#7aaeff' : '#1e3a8a' }
    // Negatively charged
    case 'D': case 'E':
      return { bg: 'rgba(255,80,80,0.20)', fg: isDark ? '#ff7070' : '#7f1d1d' }
    // Glycine — flexible
    case 'G':
      return { bg: 'rgba(160,160,180,0.16)', fg: isDark ? '#a0a0b8' : '#374151' }
    default:
      return { bg: 'rgba(120,120,140,0.12)', fg: isDark ? '#888898' : '#475569' }
  }
}
