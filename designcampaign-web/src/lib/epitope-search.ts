import type { NamedSelection, EpitopeSearchParams, EpitopeHit } from '@/stores/named-selection-store'
import { parseAtoms, type AtomRecord } from '@/lib/parsers/parse-atoms'
import { parseChainSequences } from '@/lib/parsers/pdb-sequence'
import { hashSeq } from '@/lib/hash-seq'

// ── Contact calculation ───────────────────────────────────────────────────────

/**
 * Find which target residue IDs are contacted by any binder atom within cutoff.
 * Returns a Set of resId numbers (target side).
 */
function computeEpitopeContacts(
  targetAtoms: AtomRecord[],
  binderAtoms: AtomRecord[],
  cutoff: number,
): Set<number> {
  const cutoff2 = cutoff * cutoff
  const contacted = new Set<number>()
  for (const t of targetAtoms) {
    for (const b of binderAtoms) {
      const dx = t.x - b.x, dy = t.y - b.y, dz = t.z - b.z
      if (dx*dx + dy*dy + dz*dz <= cutoff2) {
        contacted.add(t.resId)
        break
      }
    }
  }
  return contacted
}

// ── Main search ───────────────────────────────────────────────────────────────

export async function searchEpitopeContacts(
  selection: NamedSelection,
  params: EpitopeSearchParams,
  files: { name: string; filePath: string }[],
  readFile: (path: string) => Promise<string>,
  onProgress?: (done: number, total: number) => void,
): Promise<EpitopeHit[]> {
  const selectedResIds = new Set(
    selection.residues.map(k => Number(k.slice(k.lastIndexOf(':') + 1))),
  )
  const totalCount = selection.residues.length
  if (totalCount === 0) return []

  const hits: EpitopeHit[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    try {
      const pdbText = await readFile(file.filePath)

      // 1. Find which chain in this file matches the selection's chain hash
      const chainSeqs = parseChainSequences(pdbText)
      let matchedChain: string | null = null
      for (const [chain, data] of chainSeqs) {
        const h = await hashSeq(data.sequence)
        if (h === selection.chainHash) { matchedChain = chain; break }
      }
      if (!matchedChain) { onProgress?.(i + 1, files.length); continue }

      const allChains = Array.from(chainSeqs.keys())
      const binderChains = allChains.filter(c => c !== matchedChain)
      if (binderChains.length === 0) { onProgress?.(i + 1, files.length); continue }

      // 2. Parse atoms once for all relevant chains, then split target / binder.
      //    parseAtoms now supports 'ca' scope natively so no manual reshape needed.
      const allAtoms   = parseAtoms(pdbText, allChains, params.atomScope)
      const targetAtoms = allAtoms.filter(a => a.chain === matchedChain && selectedResIds.has(a.resId))
      const binderAtoms = allAtoms.filter(a => a.chain !== matchedChain)

      if (targetAtoms.length === 0 || binderAtoms.length === 0) {
        onProgress?.(i + 1, files.length); continue
      }

      // 3. Compute contacts and apply match mode filter
      const contacted   = computeEpitopeContacts(targetAtoms, binderAtoms, params.cutoff)
      const hitCount    = contacted.size
      const hitFraction = hitCount / totalCount

      let passes = false
      switch (params.matchMode) {
        case 'any':        passes = hitCount >= 1; break
        case 'all':        passes = hitCount === totalCount; break
        case 'count':      passes = hitCount >= params.matchValue; break
        case 'percentage': passes = hitFraction * 100 >= params.matchValue; break
      }

      if (passes) {
        hits.push({ filePath: file.filePath, name: file.name, hitCount, totalCount, hitFraction })
      }
    } catch { /* skip files that fail */ }

    onProgress?.(i + 1, files.length)
  }

  return hits
}
