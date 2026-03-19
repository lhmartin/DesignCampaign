/**
 * Parse Cα atom records from PDB text.
 * Uses fixed-width column positions per the PDB format specification.
 *
 * Output is ordered as encountered in the file; duplicates (insertion codes etc.)
 * are kept — callers should deduplicate if needed.
 */

export interface CaAtom {
  chain:  string   // auth chain ID (col 22, 0-indexed col 21)
  resNum: number   // auth seq num  (cols 23–26, 0-indexed 22–25)
  x:      number   // Å (cols 31–38, 0-indexed 30–37)
  y:      number   // Å (cols 39–46, 0-indexed 38–45)
  z:      number   // Å (cols 47–54, 0-indexed 46–53)
}

export function parseCaAtoms(pdbText: string): CaAtom[] {
  const atoms: CaAtom[] = []
  for (const line of pdbText.split('\n')) {
    if (line.length < 54) continue
    if (line.slice(0, 6) !== 'ATOM  ') continue
    if (line.slice(12, 16) !== ' CA ') continue
    const chain  = line.slice(21, 22).trim() || 'A'
    const resNum = parseInt(line.slice(22, 26), 10)
    const x      = parseFloat(line.slice(30, 38))
    const y      = parseFloat(line.slice(38, 46))
    const z      = parseFloat(line.slice(46, 54))
    if (isNaN(resNum) || isNaN(x) || isNaN(y) || isNaN(z)) continue
    atoms.push({ chain, resNum, x, y, z })
  }
  return atoms
}
