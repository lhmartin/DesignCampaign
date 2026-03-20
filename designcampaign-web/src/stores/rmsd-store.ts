import { create } from 'zustand'
import { parseCaAtoms, type CaAtom } from '@/lib/metrics/parse-ca-atoms'
import { useMetricsStore } from '@/stores/metrics-store'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RmsdStore {
  /** File path of the reference structure. */
  referenceFilePath: string | null
  /** Parsed Cα atoms of the reference (cached after setReference). */
  referenceAtoms: CaAtom[] | null
  /**
   * Per-residue Cα deviation (Å) after optimal superposition.
   * Outer map: filePath → inner map: "chain:resNum" → deviation.
   */
  deviationsByPath: Map<string, Map<string, number>>
  running: boolean
  error: string | null

  /** Cache the reference structure from its raw PDB text. */
  setReference(filePath: string, pdbText: string): void
  /** Clear reference and remove the `rmsd` column from the metrics table. */
  clearReference(): void
  /**
   * Batch-compute global RMSD and per-residue deviations for every row.
   * Results are injected into the metrics table as the `rmsd` column.
   */
  computeAll(
    targets: { name: string; filePath: string }[],
    readFile: (path: string) => Promise<string>,
  ): Promise<void>
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useRmsdStore = create<RmsdStore>((set, get) => ({
  referenceFilePath: null,
  referenceAtoms:    null,
  deviationsByPath:  new Map(),
  running:           false,
  error:             null,

  setReference(filePath, pdbText) {
    set({
      referenceFilePath: filePath,
      referenceAtoms:    parseCaAtoms(pdbText),
      deviationsByPath:  new Map(),
      error:             null,
    })
  },

  clearReference() {
    set({ referenceFilePath: null, referenceAtoms: null, deviationsByPath: new Map(), error: null })
    useMetricsStore.getState().injectColumn('rmsd', new Map())
  },

  async computeAll(targets, readFile) {
    const { referenceAtoms } = get()
    if (!referenceAtoms?.length) return
    set({ running: true, error: null })

    try {
      // Dynamic import — same pattern as CompareMenu in MolstarViewer.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { MinimizeRmsd } = await import('molstar/lib/mol-math/linear-algebra/3d/minimize-rmsd') as any

      // Build reference lookup: "chain:resNum" → index in referenceAtoms.
      const refMap = new Map<string, number>()
      for (let i = 0; i < referenceAtoms.length; i++) {
        refMap.set(`${referenceAtoms[i].chain}:${referenceAtoms[i].resNum}`, i)
      }

      const newDeviations  = new Map<string, Map<string, number>>()
      const injectBatch: { filePath: string; name: string; metrics: Record<string, number> }[] = []

      for (const row of targets) {
        try {
          const pdbText   = await readFile(row.filePath)
          const mobileAtoms = parseCaAtoms(pdbText)

          // Find the intersection of (chain, resNum) keys.
          const refIdxs: number[] = []
          const mobIdxs: number[] = []
          for (let j = 0; j < mobileAtoms.length; j++) {
            const key = `${mobileAtoms[j].chain}:${mobileAtoms[j].resNum}`
            const ri  = refMap.get(key)
            if (ri !== undefined) { refIdxs.push(ri); mobIdxs.push(j) }
          }
          if (refIdxs.length < 3) continue   // need at least 3 points for alignment

          const a = {
            x: refIdxs.map(i => referenceAtoms[i].x),
            y: refIdxs.map(i => referenceAtoms[i].y),
            z: refIdxs.map(i => referenceAtoms[i].z),
          }
          const b = {
            x: mobIdxs.map(i => mobileAtoms[i].x),
            y: mobIdxs.map(i => mobileAtoms[i].y),
            z: mobIdxs.map(i => mobileAtoms[i].z),
          }

          const result = MinimizeRmsd.compute({ a, b })
          const m = result.bTransform as number[]  // 16-element column-major Mat4

          // Apply transform to each mobile Cα and measure distance to its reference peer.
          const devMap = new Map<string, number>()
          for (let k = 0; k < mobIdxs.length; k++) {
            const ma  = mobileAtoms[mobIdxs[k]]
            const ra  = referenceAtoms[refIdxs[k]]
            const tx  = m[0]*ma.x + m[4]*ma.y + m[8]*ma.z + m[12]
            const ty  = m[1]*ma.x + m[5]*ma.y + m[9]*ma.z + m[13]
            const tz  = m[2]*ma.x + m[6]*ma.y + m[10]*ma.z + m[14]
            const dev = Math.sqrt((tx-ra.x)**2 + (ty-ra.y)**2 + (tz-ra.z)**2)
            devMap.set(`${ma.chain}:${ma.resNum}`, dev)
          }

          newDeviations.set(row.filePath, devMap)
          injectBatch.push({ filePath: row.filePath, name: row.name, metrics: { rmsd: result.rmsd } })
        } catch { /* skip structures that fail — missing file, bad PDB, etc. */ }
      }

      useMetricsStore.getState().batchInjectResults(injectBatch)

      set(s => ({
        deviationsByPath: new Map([...s.deviationsByPath, ...newDeviations]),
        running: false,
      }))
    } catch (err) {
      set({ running: false, error: err instanceof Error ? err.message : String(err) })
    }
  },
}))
