// Three-letter to one-letter amino acid code mapping
export const THREE_TO_ONE: Record<string, string> = {
  ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C',
  GLN: 'Q', GLU: 'E', GLY: 'G', HIS: 'H', ILE: 'I',
  LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P',
  SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V',
  // Non-standard but common
  MSE: 'M',  // Selenomethionine
  SEC: 'U',  // Selenocysteine
  PYL: 'O',  // Pyrrolysine
}

// Maximum Accessible Surface Area (Tien et al. 2013) — Å²
// Used for RASA normalization
export const MAX_ASA: Record<string, number> = {
  ALA: 129.0, ARG: 274.0, ASN: 195.0, ASP: 193.0, CYS: 167.0,
  GLN: 225.0, GLU: 223.0, GLY: 104.0, HIS: 224.0, ILE: 197.0,
  LEU: 201.0, LYS: 236.0, MET: 224.0, PHE: 240.0, PRO: 159.0,
  SER: 155.0, THR: 172.0, TRP: 285.0, TYR: 263.0, VAL: 174.0,
}

// Kyte-Doolittle hydrophobicity scale — range: -4.5 to +4.5
export const HYDROPHOBICITY: Record<string, number> = {
  ALA:  1.8, ARG: -4.5, ASN: -3.5, ASP: -3.5, CYS:  2.5,
  GLN: -3.5, GLU: -3.5, GLY: -0.4, HIS: -3.2, ILE:  4.5,
  LEU:  3.8, LYS: -3.9, MET:  1.9, PHE:  2.8, PRO: -1.6,
  SER: -0.8, THR: -0.7, TRP: -0.9, TYR: -1.3, VAL:  4.2,
}

// Van der Waals radii in Å (Bondi radii)
export const VDW_RADII: Record<string, number> = {
  C: 1.70, N: 1.55, O: 1.52, S: 1.80, H: 1.20, P: 1.80, SE: 1.90,
}
