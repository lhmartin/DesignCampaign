/**
 * Syncs a set of SelectionKey strings to the Mol* 3D viewer.
 * Called from SequenceViewer click handlers and from MolstarViewer's
 * selectedResidues effect, so external selectAll() calls (InterfaceGroup,
 * SelectionPanel, etc.) automatically highlight in the 3D canvas.
 */
type PluginUIContext = import('molstar/lib/mol-plugin-ui/context').PluginUIContext

export async function syncToMolstar(plugin: PluginUIContext | null, keys: string[]): Promise<void> {
  if (!plugin) return
  if (keys.length === 0) {
    try { plugin.managers.interactivity.lociSelects.deselectAll() } catch { /* best effort */ }
    return
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { Script } = await import('molstar/lib/mol-script/script') as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { StructureSelection } = await import('molstar/lib/mol-model/structure') as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { MolScriptBuilder: B } = await import('molstar/lib/mol-script/language/builder') as any
    const struct = plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data
    if (!struct) return

    const byChain: Record<string, number[]> = {}
    for (const key of keys) {
      const sep = key.lastIndexOf(':')
      const chainId = key.slice(0, sep)
      const resId   = Number(key.slice(sep + 1))
      ;(byChain[chainId] ??= []).push(resId)
    }

    const exprs = Object.entries(byChain).map(([chainId, resIds]) =>
      B.struct.generator.atomGroups({
        'chain-test': B.core.rel.eq([B.struct.atomProperty.macromolecular.auth_asym_id(), chainId]),
        'residue-test': B.core.set.has([
          B.set(...resIds),
          B.struct.atomProperty.macromolecular.auth_seq_id(),
        ]),
      })
    )
    const query = exprs.length === 1 ? exprs[0] : B.struct.combinator.merge(exprs)
    const sel  = Script.getStructureSelection((_: unknown) => query, struct)
    const loci = StructureSelection.toLociWithSourceUnits(sel)
    plugin.managers.interactivity.lociSelects.selectOnly({ loci })
  } catch { /* best effort — 3D sync is non-critical */ }
}
