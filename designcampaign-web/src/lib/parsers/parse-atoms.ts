export interface AtomRecord {
  chain:    string
  resId:    number
  resName:  string   // 3-letter amino acid code, e.g. "ALA", "GLY"
  atomName: string
  x: number
  y: number
  z: number
}

export const BACKBONE_ATOMS = new Set(['N', 'CA', 'C', 'O'])

/**
 * Parse ATOM/HETATM records from a PDB text for the given chains.
 * Skips hydrogen atoms (atom name starts with H or D after trimming).
 * In 'backbone' mode, keeps only N, CA, C, O atoms.
 */
export function parseAtoms(
  pdbText: string,
  chains: string[],
  scope: 'all-heavy' | 'backbone' | 'ca',
): AtomRecord[] {
  const chainSet = new Set(chains)
  const records: AtomRecord[] = []

  for (const line of pdbText.split('\n')) {
    const rec = line.slice(0, 6).trim()
    if (rec !== 'ATOM' && rec !== 'HETATM') continue

    // PDB column layout (1-based): chain=22, resSeq=23-26, resName=18-20, atomName=13-16, x=31-38, y=39-46, z=47-54
    const chain    = line[21] ?? ' '
    if (!chainSet.has(chain)) continue

    const atomName = line.slice(12, 16).trim()
    // Skip hydrogens
    const firstChar = atomName[0]
    if (firstChar === 'H' || firstChar === 'D') continue
    // CA-only filter
    if (scope === 'ca' && atomName !== 'CA') continue
    // Backbone filter
    if (scope === 'backbone' && !BACKBONE_ATOMS.has(atomName)) continue

    const resName = line.slice(17, 20).trim()
    const resId   = parseInt(line.slice(22, 26).trim(), 10)
    const x       = parseFloat(line.slice(30, 38))
    const y       = parseFloat(line.slice(38, 46))
    const z       = parseFloat(line.slice(46, 54))

    if (isNaN(resId) || isNaN(x) || isNaN(y) || isNaN(z)) continue

    records.push({ chain, resId, resName, atomName, x, y, z })
  }

  return records
}
