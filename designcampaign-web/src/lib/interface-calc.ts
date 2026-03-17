import type { AtomRecord } from './parsers/parse-atoms'
import type { AtomScope } from '@/stores/interface-store'
import type { SelectionKey } from '@/types/selection'

type PluginUIContext = import('molstar/lib/mol-plugin-ui/context').PluginUIContext

const BACKBONE_ATOMS = new Set(['N', 'CA', 'C', 'O'])

// ─── Atom extraction from live Mol* plugin ───────────────────────────────────

/**
 * Extract atom coordinates from the currently loaded Mol* structure for the
 * specified chains. Uses the same hierarchy-traversal pattern as extractCAPositions.
 */
export function extractAtomsFromPlugin(
  plugin: PluginUIContext,
  chains: string[],
  scope: AtomScope,
): AtomRecord[] {
  const chainSet = new Set(chains)
  const records: AtomRecord[] = []

  try {
    const structures = (plugin as any).managers.structure.hierarchy.current.structures
    if (structures.length === 0) return records

    const structure = (structures[0].cell.obj as any)?.data
    if (!structure) return records

    for (const unit of structure.units as any[]) {
      if (unit.kind !== 0) continue   // 0 = atomic unit

      const hierarchy = unit.model?.atomicHierarchy
      const conf      = unit.model?.atomicConformation

      const atomIdCol    = hierarchy?.atoms?.auth_atom_id
      const chainIdCol   = hierarchy?.chains?.auth_asym_id
      const resSeqCol    = hierarchy?.residues?.auth_seq_id
      const resAtomSeg   = hierarchy?.residueAtomSegments
      const chainAtomSeg = hierarchy?.chainAtomSegments

      if (!atomIdCol?.value || !chainIdCol?.value || !resSeqCol?.value
          || !resAtomSeg?.index || !chainAtomSeg?.index || !conf?.x) continue

      const elements: ArrayLike<number> = unit.elements

      for (let i = 0; i < elements.length; i++) {
        try {
          const atomIdx   = elements[i]
          const atomName  = atomIdCol.value(atomIdx) as string
          const firstChar = atomName[0]

          // Skip hydrogens
          if (firstChar === 'H' || firstChar === 'D') continue
          // Backbone filter
          if (scope === 'backbone' && !BACKBONE_ATOMS.has(atomName)) continue

          const chainIdx = chainAtomSeg.index[atomIdx]
          const chain    = chainIdCol.value(chainIdx) as string
          if (!chain || !chainSet.has(chain)) continue

          const residueIdx = resAtomSeg.index[atomIdx]
          const resId      = resSeqCol.value(residueIdx) as number

          records.push({
            chain, resId, atomName,
            x: conf.x[atomIdx],
            y: conf.y[atomIdx],
            z: conf.z[atomIdx],
          })
        } catch { /* skip malformed atom */ }
      }
    }
  } catch { /* graceful fallback */ }

  return records
}

// ─── Contact computation (shared by single-structure + batch) ─────────────────

export interface ContactResult {
  paratope:  Set<SelectionKey>   // binder residues in contact
  epitope:   Set<SelectionKey>   // target residues in contact
  nContacts: number              // raw atom-pair contact count
}

/**
 * Find all binder↔target atom pairs within `cutoff` Å.
 * Uses squared-distance to avoid sqrt; O(n×m) is fine for < 20 k atoms.
 */
export function computeContacts(
  binderAtoms: AtomRecord[],
  targetAtoms: AtomRecord[],
  cutoff: number,
): ContactResult {
  const cutoff2  = cutoff * cutoff
  const paratope = new Set<SelectionKey>()
  const epitope  = new Set<SelectionKey>()
  let nContacts  = 0

  for (const a of binderAtoms) {
    for (const b of targetAtoms) {
      const dx = a.x - b.x
      const dy = a.y - b.y
      const dz = a.z - b.z
      if (dx * dx + dy * dy + dz * dz <= cutoff2) {
        paratope.add(`${a.chain}:${a.resId}`)
        epitope.add(`${b.chain}:${b.resId}`)
        nContacts++
      }
    }
  }

  return { paratope, epitope, nContacts }
}
