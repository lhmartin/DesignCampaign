import { create } from 'zustand'
import { pythonCall } from '@/lib/python-bridge'
import { useMetricsStore } from '@/stores/metrics-store'
import { useSequenceStore } from '@/stores/sequence-store'

// ── Types ─────────────────────────────────────────────────────────────────────

export type CdrRegionName = 'CDR1' | 'CDR2' | 'CDR3' | 'FW1' | 'FW2' | 'FW3' | 'FW4'

/**
 * Per-chain CDR annotation.
 * `assignments[i]` is the region label for the i-th residue in that chain
 * (same indexing as `ChainSequence.residues`).
 */
export interface ChainCdrAnnotation {
  chain: string
  /** AntPack-identified chain type: 'H' (heavy), 'L' or 'K' (light) */
  chainType: 'H' | 'L' | 'K'
  scheme: string
  percentIdentity: number
  /** Array aligned to chain residues: CdrRegionName or null for unassigned. */
  assignments: (CdrRegionName | null)[]
}

interface SidecarChainResult {
  name: string
  chain: string
  chain_type: 'H' | 'L' | 'K'
  scheme: string
  percent_identity: number
  assignments: (CdrRegionName | null)[]
  error: string | null
}

export type CdrConfidenceFilter = 'all' | 'medium' | 'high'

/** Minimum percent identity thresholds for each filter level. */
export const CDR_CONFIDENCE_THRESHOLDS: Record<CdrConfidenceFilter, number> = {
  all:    0,
  medium: 0.4,
  high:   0.7,
}

interface AntPackStore {
  /** Map from structure file path → per-chain annotations */
  annotations: Map<string, ChainCdrAnnotation[]>
  /** Set of file paths currently being annotated */
  running: Set<string>
  /** Map from file path → error message */
  errors: Map<string, string>
  /**
   * Only render CDR annotation tracks for chains whose AntPack percent identity
   * meets this threshold. 'all' = no filter; 'medium' = ≥40%; 'high' = ≥70%.
   */
  cdrConfidenceFilter: CdrConfidenceFilter
  setCdrConfidenceFilter: (filter: CdrConfidenceFilter) => void

  /**
   * Annotate the chains of a structure.
   * `chains` should come directly from `seqData.seq` in MolstarViewer.
   */
  annotate(
    filePath: string,
    chains: { chain: string; residues: { code: string }[] }[],
    scheme?: string,
  ): Promise<void>

  /**
   * Annotate every loaded structure in one batched sidecar call.
   * Sequences are sourced from sequenceStore (populated by calculateAll).
   * Returns the number of structures submitted.
   */
  annotateAll(scheme?: string): Promise<number>

  clearAnnotations(filePath: string): void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Compute CDR length metrics for a set of chain annotations. */
function computeCdrMetrics(annotations: ChainCdrAnnotation[]): Record<string, number> {
  const metrics: Record<string, number> = {}
  for (const ann of annotations) {
    const prefix = ann.chainType === 'H' ? 'h' : 'l'
    for (const n of [1, 2, 3] as const) {
      const region = `CDR${n}` as CdrRegionName
      metrics[`cdr_${prefix}${n}_len`] = ann.assignments.filter(a => a === region).length
    }
  }
  return metrics
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAntpackStore = create<AntPackStore>((set, get) => ({
  annotations:          new Map(),
  running:              new Set(),
  errors:               new Map(),
  cdrConfidenceFilter:  'all',
  setCdrConfidenceFilter: (filter) => set({ cdrConfidenceFilter: filter }),

  async annotate(filePath, chains, scheme = 'imgt') {
    if (get().running.has(filePath)) return

    set(s => ({
      running: new Set([...s.running, filePath]),
      errors:  new Map([...s.errors].filter(([k]) => k !== filePath)),
    }))

    try {
      const sequences = chains.map(c => ({
        name:     filePath,
        chain:    c.chain,
        sequence: c.residues.map(r => r.code).join(''),
      }))

      const results = await pythonCall<SidecarChainResult[]>('antpack_number', {
        sequences,
        scheme,
      })

      const chainAnnotations: ChainCdrAnnotation[] = results.map(r => ({
        chain:           r.chain,
        chainType:       r.chain_type ?? 'H',
        scheme:          r.scheme,
        percentIdentity: r.percent_identity,
        assignments:     r.assignments,
      }))

      // Inject CDR length columns into the metrics table.
      const rowName = useMetricsStore.getState().rows.find(r => r.filePath === filePath)?.name ?? filePath
      useMetricsStore.getState().batchInjectResults([{ filePath, name: rowName, metrics: computeCdrMetrics(chainAnnotations) }])

      set(s => {
        const next = new Map(s.annotations)
        next.set(filePath, chainAnnotations)
        const running = new Set(s.running)
        running.delete(filePath)
        return { annotations: next, running }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set(s => {
        const running = new Set(s.running)
        running.delete(filePath)
        return {
          running,
          errors: new Map([...s.errors, [filePath, msg]]),
        }
      })
    }
  },

  async annotateAll(scheme = 'imgt') {
    const rows      = useMetricsStore.getState().rows
    const sequences = useSequenceStore.getState().sequences

    // Build filePath→rowName lookup once (O(M)) to avoid repeated rows.find() later.
    const rowNameByPath = new Map(rows.filter(r => r.filePath).map(r => [r.filePath!, r.name]))

    // Build a flat batch: one entry per chain across all structures.
    // Track which entry belongs to which filePath so we can split results back out.
    type BatchEntry = { filePath: string; name: string; chain: string; sequence: string }
    const batch: BatchEntry[] = []

    for (const row of rows) {
      if (!row.filePath) continue
      const chainSeqs = sequences.get(row.name)
      if (!chainSeqs?.length) continue
      for (const cs of chainSeqs) {
        batch.push({ filePath: row.filePath, name: row.name, chain: cs.chain, sequence: cs.seq })
      }
    }
    if (batch.length === 0) return 0

    const filePathSet  = new Set(batch.map(b => b.filePath))
    const filePaths    = [...filePathSet]

    set(s => ({
      running: new Set([...s.running, ...filePaths]),
      errors:  new Map([...s.errors].filter(([k]) => !filePathSet.has(k))),
    }))

    try {
      const results = await pythonCall<SidecarChainResult[]>('antpack_number', {
        sequences: batch,
        scheme,
      })

      // Group chain annotations back by filePath (results are in the same order as batch).
      const annotationsByPath = new Map<string, ChainCdrAnnotation[]>()
      for (let i = 0; i < results.length; i++) {
        const r  = results[i]
        const fp = batch[i].filePath
        if (!annotationsByPath.has(fp)) annotationsByPath.set(fp, [])
        annotationsByPath.get(fp)!.push({
          chain:           r.chain,
          chainType:       r.chain_type ?? 'H',
          scheme:          r.scheme,
          percentIdentity: r.percent_identity,
          assignments:     r.assignments,
        })
      }

      // Inject CDR length metrics for every structure.
      const injectBatch = [...annotationsByPath.entries()].map(([fp, anns]) => ({
        filePath: fp,
        name:     rowNameByPath.get(fp) ?? fp,
        metrics:  computeCdrMetrics(anns),
      }))
      useMetricsStore.getState().batchInjectResults(injectBatch)

      set(s => {
        const next    = new Map(s.annotations)
        const running = new Set(s.running)
        for (const [fp, anns] of annotationsByPath) next.set(fp, anns)
        for (const fp of filePaths) running.delete(fp)
        return { annotations: next, running }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set(s => {
        const running = new Set(s.running)
        for (const fp of filePaths) running.delete(fp)
        return { running, errors: new Map([...s.errors, ...filePaths.map(fp => [fp, msg] as [string, string])]) }
      })
    }

    return filePaths.length
  },

  clearAnnotations(filePath) {
    set(s => {
      const next    = new Map(s.annotations)
      const errors  = new Map(s.errors)
      next.delete(filePath)
      errors.delete(filePath)
      return { annotations: next, errors }
    })
  },
}))
