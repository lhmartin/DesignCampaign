import type { AtomScope } from '@/stores/interface-store'
import type { SelectionKey } from '@/types/selection'
import { type AtomRecord, BACKBONE_ATOMS } from './parsers/parse-atoms'
import { aggregateResidueProps, type ResidueProps } from './residue-props'

type PluginUIContext = import('molstar/lib/mol-plugin-ui/context').PluginUIContext

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
      const atomCompCol  = hierarchy?.atoms?.auth_comp_id
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
          const resName    = (atomCompCol?.value(atomIdx) as string | undefined) ?? ''

          records.push({
            chain, resId, resName, atomName,
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

// Heavy-atom h-bond proxy: N/O donors and acceptors within 3.5 Å
const HBOND_ATOMS = new Set([
  'N', 'O',
  'ND1', 'ND2', 'NE', 'NE1', 'NE2', 'NH1', 'NH2', 'NZ',
  'OD1', 'OD2', 'OE1', 'OE2', 'OG', 'OG1', 'OH',
])
const HBOND_CUTOFF2 = 3.5 * 3.5
const CLASH_CUTOFF2 = 2.0 * 2.0

export interface ContactResult {
  paratope:      Set<SelectionKey>   // binder residues in contact
  epitope:       Set<SelectionKey>   // target residues in contact
  nContacts:     number              // raw atom-pair contact count
  nHBonds:       number              // probable h-bonds (N/O heavy-atom proxy, ≤ 3.5 Å)
  nClashes:      number              // steric clashes (heavy atoms ≤ 2.0 Å)
  paratopeProps: ResidueProps        // physicochemical properties of binder interface
  epitopeProps:  ResidueProps        // physicochemical properties of target interface
}

/**
 * Find all binder↔target atom pairs within `cutoff` Å, and simultaneously
 * detect probable h-bonds and steric clashes.
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
  let nHBonds    = 0
  let nClashes   = 0

  // Build resName lookup maps (one entry per residue key, first atom wins)
  const binderResNames = new Map<SelectionKey, string>()
  for (const a of binderAtoms) {
    const k = `${a.chain}:${a.resId}` as SelectionKey
    if (!binderResNames.has(k)) binderResNames.set(k, a.resName)
  }
  const targetResNames = new Map<SelectionKey, string>()
  for (const b of targetAtoms) {
    const k = `${b.chain}:${b.resId}` as SelectionKey
    if (!targetResNames.has(k)) targetResNames.set(k, b.resName)
  }

  for (const a of binderAtoms) {
    for (const b of targetAtoms) {
      const dx = a.x - b.x
      const dy = a.y - b.y
      const dz = a.z - b.z
      const dist2 = dx * dx + dy * dy + dz * dz
      if (dist2 > cutoff2) continue

      paratope.add(`${a.chain}:${a.resId}`)
      epitope.add(`${b.chain}:${b.resId}`)
      nContacts++

      if (dist2 <= HBOND_CUTOFF2 && HBOND_ATOMS.has(a.atomName) && HBOND_ATOMS.has(b.atomName))
        nHBonds++
      if (dist2 <= CLASH_CUTOFF2)
        nClashes++
    }
  }

  const paratopeProps = aggregateResidueProps([...paratope].map(k => binderResNames.get(k) ?? ''))
  const epitopeProps  = aggregateResidueProps([...epitope].map(k => targetResNames.get(k) ?? ''))

  return { paratope, epitope, nContacts, nHBonds, nClashes, paratopeProps, epitopeProps }
}
