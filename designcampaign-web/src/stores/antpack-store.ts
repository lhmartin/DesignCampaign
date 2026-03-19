import { create } from 'zustand'
import { pythonCall } from '@/lib/python-bridge'

// ── Types ─────────────────────────────────────────────────────────────────────

export type CdrRegionName = 'CDR1' | 'CDR2' | 'CDR3' | 'FW1' | 'FW2' | 'FW3' | 'FW4'

/**
 * Per-chain CDR annotation.
 * `assignments[i]` is the region label for the i-th residue in that chain
 * (same indexing as `ChainSequence.residues`).
 */
export interface ChainCdrAnnotation {
  chain: string
  scheme: string
  percentIdentity: number
  /** Array aligned to chain residues: CdrRegionName or null for unassigned. */
  assignments: (CdrRegionName | null)[]
}

interface SidecarChainResult {
  name: string
  chain: string
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
        scheme:          r.scheme,
        percentIdentity: r.percent_identity,
        assignments:     r.assignments,
      }))

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
