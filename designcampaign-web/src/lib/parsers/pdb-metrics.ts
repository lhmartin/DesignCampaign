/** Aggregate metrics extracted from a single PDB file. */
export interface PDBMetrics {
  mean_plddt: number      // mean CA B-factor (pLDDT for AlphaFold structures)
  mean_bfactor: number    // mean B-factor across all atoms
  num_residues: number    // number of unique residues (CA atoms)
  chain_count: number     // number of unique chains
}

export function extractMetricsFromPDB(pdbContent: string): PDBMetrics {
  const caAtoms: { chain: string; resKey: string; bfactor: number }[] = []
  const allBFactors: number[] = []
  const residueSet = new Set<string>()
  const chainSet = new Set<string>()

  for (const line of pdbContent.split('\n')) {
    if (line.length < 66) continue
    if (line.slice(0, 4) !== 'ATOM') continue

    const bfactor = parseFloat(line.slice(60, 66))
    if (isNaN(bfactor)) continue

    const chain = line[21]
    const resNum = line.slice(22, 26).trim()
    const atomName = line.slice(12, 16).trim()
    const resKey = `${chain}:${resNum}`

    chainSet.add(chain)
    allBFactors.push(bfactor)

    if (atomName === 'CA') {
      residueSet.add(resKey)
      caAtoms.push({ chain, resKey, bfactor })
    }
  }

  const mean_plddt = caAtoms.length > 0
    ? round2(caAtoms.reduce((s, a) => s + a.bfactor, 0) / caAtoms.length)
    : 0
  const mean_bfactor = allBFactors.length > 0
    ? round2(allBFactors.reduce((s, v) => s + v, 0) / allBFactors.length)
    : 0

  return {
    mean_plddt,
    mean_bfactor,
    num_residues: residueSet.size,
    chain_count: chainSet.size,
  }
}

function round2(v: number) { return Math.round(v * 100) / 100 }
