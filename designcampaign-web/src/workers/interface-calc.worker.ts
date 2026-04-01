/**
 * Web Worker: batch interface contact calculation.
 * Receives a batch of file texts + chain config, returns contact results.
 * Runs entirely off the main thread so the UI stays responsive.
 */
import { parseAtoms } from '@/lib/parsers/parse-atoms'
import { computeContacts } from '@/lib/interface-calc'
import type { ResidueProps } from '@/lib/residue-props'
import type { AtomScope } from '@/stores/interface-store'

export interface WorkerBatchInput {
  files: Array<{ path: string; name: string; text: string }>
  binderChains: string[]
  targetChains: string[]
  atomScope: AtomScope
  cutoff: number
}

export interface WorkerFileResult {
  filePath: string
  name: string
  nParatope: number
  nEpitope: number
  nContacts: number
  nHBonds: number
  nClashes: number
  paratopeProps: ResidueProps
  epitopeProps: ResidueProps
  paratope: string[]
  epitope: string[]
}

onmessage = (e: MessageEvent<WorkerBatchInput>) => {
  const { files, binderChains, targetChains, atomScope, cutoff } = e.data
  const results: WorkerFileResult[] = []

  for (const file of files) {
    if (!file.text) continue
    try {
      const binderAtoms = parseAtoms(file.text, binderChains, atomScope)
      const targetAtoms = parseAtoms(file.text, targetChains, atomScope)
      const { paratope, epitope, nContacts, nHBonds, nClashes, paratopeProps, epitopeProps } = computeContacts(binderAtoms, targetAtoms, cutoff)
      results.push({
        filePath: file.path,
        name: file.name,
        nParatope: paratope.size,
        nEpitope: epitope.size,
        nContacts,
        nHBonds,
        nClashes,
        paratopeProps,
        epitopeProps,
        paratope: Array.from(paratope),
        epitope: Array.from(epitope),
      })
    } catch { /* skip unreadable files */ }
  }

  postMessage(results)
}
