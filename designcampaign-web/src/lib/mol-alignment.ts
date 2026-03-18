/**
 * Shared alignment utilities used by ComparisonPanel and CompareMenu.
 *
 * TransformStructureConformation is a Mol* decorator transform (isDecorator: true).
 * That means it must be APPLIED as a child node of the StructureFromModel cell —
 * NOT used to replace that cell via .update(). Because it is a decorator, Mol*
 * automatically routes all sibling components (polymer, ligand, …) through the
 * transformed structure coordinates.
 *
 *   StructureFromModel  ←  structures[i].cell
 *     ├─ polymer component  ─┐  (auto-routed through decorator)
 *     ├─ ligand component   ─┤
 *     └─ TransformStructureConformation (isDecorator: true)  ← our node
 *
 * On first align: .apply() to create the decorator; store ref in entry.dataRef.
 * On subsequent aligns: .update() the existing decorator params.
 */

export interface CAPositions {
  x: number[]
  y: number[]
  z: number[]
}

/** Extract Cα atom coordinates from a Mol* Structure object. */
export function extractCAPositions(structure: unknown): CAPositions {
  const x: number[] = [], y: number[] = [], z: number[] = []
  try {
    const s = structure as any
    for (const unit of s.units) {
      if (unit.kind !== 0) continue                 // 0 = atomic
      const { atoms } = unit.model.atomicHierarchy
      const conf = unit.model.atomicConformation
      for (let i = 0; i < unit.elements.length; i++) {
        const idx = unit.elements[i]
        if (atoms.auth_atom_id.value(idx) === 'CA') {
          x.push(conf.x[idx])
          y.push(conf.y[idx])
          z.push(conf.z[idx])
        }
      }
    }
  } catch { /* return whatever was collected */ }
  return { x, y, z }
}

/**
 * Apply a rigid-body superposition transform to a Mol* structure.
 *
 * @param plugin  - live PluginUIContext
 * @param structureCellRef - state-tree ref of the StructureFromModel cell to move
 * @param mat4Data - column-major 16-element Mat4 array (output of MinimizeRmsd)
 * @param existingXformRef - dataRef stored from a previous align call (or null)
 * @returns the ref of the TransformStructureConformation node (store in entry.dataRef)
 */
// Cached once on first use — the transforms module is large and doesn't change at runtime.
let _StateTransforms: any = null
async function getStateTransforms() {
  if (!_StateTransforms) {
    const m = await import('molstar/lib/mol-plugin-state/transforms') as any
    _StateTransforms = m.StateTransforms
  }
  return _StateTransforms
}

export async function applyStructureTransform(
  plugin: any,
  structureCellRef: string,
  mat4Data: number[],
  existingXformRef: string | null,
): Promise<string> {
  const StateTransforms = await getStateTransforms()

  const transformParams = {
    transform: {
      name: 'matrix' as const,
      params: { data: mat4Data, transpose: false },
    },
  }

  if (existingXformRef && plugin.state.data.cells.has(existingXformRef)) {
    // Decorator already exists — just update its params
    const update = plugin.state.data.build()
      .to(existingXformRef)
      .update(StateTransforms.Model.TransformStructureConformation, () => transformParams)
    await plugin.runTask(plugin.state.data.updateTree(update))
    return existingXformRef
  }

  // First align: insert TransformStructureConformation as a decorator child
  const newRef = `cmp-xform-${crypto.randomUUID()}`
  const update = plugin.state.data.build()
    .to(structureCellRef)
    .apply(
      StateTransforms.Model.TransformStructureConformation,
      transformParams,
      { ref: newRef },
    )
  await plugin.runTask(plugin.state.data.updateTree(update))
  return newRef
}
