import { create } from 'zustand'
import { pythonCall } from '@/lib/python-bridge'
import { useMetricsStore } from '@/stores/metrics-store'

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

interface AntPackStore {
  /** Map from structure file path → per-chain annotations */
  annotations: Map<string, ChainCdrAnnotation[]>
  /** Set of file paths currently being annotated */
  running: Set<string>
  /** Map from file path → error message */
  errors: Map<string, string>

  /**
   * Annotate the chains of a structure.
   * `chains` should come directly from `seqData.seq` in MolstarViewer.
   */
  annotate(
    filePath: string,
    chains: { chain: string; residues: { code: string }[] }[],
    scheme?: string,
  ): Promise<void>

  clearAnnotations(filePath: string): void
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAntpackStore = create<AntPackStore>((set, get) => ({
  annotations: new Map(),
  running:     new Set(),
  errors:      new Map(),

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
      // Heavy chains → cdr_h1_len / cdr_h2_len / cdr_h3_len
      // Light chains  → cdr_l1_len / cdr_l2_len / cdr_l3_len
      const cdrMetrics: Record<string, number> = {}
      for (const ann of chainAnnotations) {
        const prefix = ann.chainType === 'H' ? 'h' : 'l'
        for (const n of [1, 2, 3] as const) {
          const region = `CDR${n}` as const
          cdrMetrics[`cdr_${prefix}${n}_len`] = ann.assignments.filter(a => a === region).length
        }
      }
      const rowName = useMetricsStore.getState().rows.find(r => r.filePath === filePath)?.name ?? filePath
      useMetricsStore.getState().batchInjectResults([{ filePath, name: rowName, metrics: cdrMetrics }])

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
