// Formal charge at pH 7
export const RESIDUE_CHARGE: Record<string, number> = {
  ARG: +1, LYS: +1, ASP: -1, GLU: -1,
}

// Kyte-Doolittle hydrophobicity scale
export const RESIDUE_HYDROPHOBICITY: Record<string, number> = {
  ILE: 4.5, VAL: 4.2, LEU: 3.8, PHE: 2.8, CYS: 2.5, MET: 1.9, ALA: 1.8,
  GLY: -0.4, THR: -0.7, SER: -0.8, TRP: -0.9, TYR: -1.3, PRO: -1.6,
  HIS: -3.2, GLU: -3.5, GLN: -3.5, ASP: -3.5, ASN: -3.5, LYS: -3.9, ARG: -4.5,
}

export const AROMATIC_RESIDUES = new Set(['PHE', 'TYR', 'TRP', 'HIS'])
export const NONPOLAR_RESIDUES = new Set(['ALA', 'VAL', 'ILE', 'LEU', 'MET', 'PHE', 'TRP', 'PRO', 'GLY'])
export const POLAR_RESIDUES    = new Set(['SER', 'THR', 'CYS', 'TYR', 'ASN', 'GLN', 'ARG', 'LYS', 'HIS', 'ASP', 'GLU'])

export interface ResidueProps {
  charge:         number   // net formal charge (sum)
  hydrophobicity: number   // mean Kyte-Doolittle score
  aromatic:       number   // count of aromatic residues (PHE/TYR/TRP/HIS)
  polar:          number   // count of polar residues
  nonpolar:       number   // count of nonpolar residues
}

export const ZERO_RESIDUE_PROPS: ResidueProps = { charge: 0, hydrophobicity: 0, aromatic: 0, polar: 0, nonpolar: 0 }

/** Aggregate physicochemical properties from a list of residue 3-letter codes. */
export function aggregateResidueProps(resNames: string[]): ResidueProps {
  let charge = 0, hydSum = 0, hydCount = 0, aromatic = 0, polar = 0, nonpolar = 0
  for (const name of resNames) {
    charge += RESIDUE_CHARGE[name] ?? 0
    const h = RESIDUE_HYDROPHOBICITY[name]
    if (h !== undefined) { hydSum += h; hydCount++ }
    if (AROMATIC_RESIDUES.has(name)) aromatic++
    if (POLAR_RESIDUES.has(name))    polar++
    if (NONPOLAR_RESIDUES.has(name)) nonpolar++
  }
  return {
    charge,
    hydrophobicity: hydCount > 0 ? Math.round(hydSum / hydCount * 100) / 100 : 0,
    aromatic, polar, nonpolar,
  }
}
