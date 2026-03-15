import { THREE_TO_ONE } from '@/lib/constants/amino-acids'

export interface ChainData {
  sequence: string
  numResidues: number
}

/** Parse per-chain amino acid sequences from PDB text content.
 *  Primary: SEQRES records. Fallback: ATOM CA records. */
export function parseChainSequences(pdbContent: string): Map<string, ChainData> {
  const seqresMap = new Map<string, string[]>()

  for (const line of pdbContent.split('\n')) {
    if (line.length < 19 || line.slice(0, 6).trimEnd() !== 'SEQRES') continue
    const chain = line[11]
    if (!chain || chain === ' ') continue
    const residues = line.slice(19, 70).trim().split(/\s+/).filter(Boolean)
    if (!seqresMap.has(chain)) seqresMap.set(chain, [])
    seqresMap.get(chain)!.push(...residues)
  }

  if (seqresMap.size === 0) {
    // Fallback: unique (chain, resSeq) from ATOM CA records
    const seenRes = new Map<string, Map<number, string>>()
    for (const line of pdbContent.split('\n')) {
      if (line.length < 27) continue
      if (line.slice(0, 4) !== 'ATOM') continue
      if (line.slice(12, 16).trim() !== 'CA') continue
      const chain = line[21]
      if (!chain || chain === ' ') continue
      const resSeq = parseInt(line.slice(22, 26).trim(), 10)
      if (isNaN(resSeq)) continue
      const resName = line.slice(17, 20).trim()
      if (!seenRes.has(chain)) seenRes.set(chain, new Map())
      if (!seenRes.get(chain)!.has(resSeq)) seenRes.get(chain)!.set(resSeq, resName)
    }
    for (const [chain, residues] of seenRes) {
      seqresMap.set(
        chain,
        Array.from(residues.entries()).sort(([a], [b]) => a - b).map(([, r]) => r),
      )
    }
  }

  const result = new Map<string, ChainData>()
  for (const [chain, residues] of seqresMap) {
    const sequence = residues.map(r => THREE_TO_ONE[r] ?? 'X').join('')
    result.set(chain, { sequence, numResidues: residues.length })
  }
  return result
}
