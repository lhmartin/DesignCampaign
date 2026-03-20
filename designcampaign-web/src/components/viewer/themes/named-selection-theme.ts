const DIM_GREY = 0x444455

export async function registerNamedSelectionTheme(
  plugin: import('molstar/lib/mol-plugin-ui/context').PluginUIContext,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { StructureElement, StructureProperties } = await import('molstar/lib/mol-model/structure') as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { Color } = await import('molstar/lib/mol-util/color') as any
  const { useNamedSelectionStore } = await import('@/stores/named-selection-store')

  const registry = plugin.representation.structure.themes.colorThemeRegistry
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  try { if ((registry as any).has('named-selection')) return } catch { /* ignore */ }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provider: any = {
    name:     'named-selection',
    label:    'Named Selections',
    category: 'Custom',
    factory: (_ctx: unknown, props: unknown) => {
      // Build key→color lookup once per theme application (not per residue).
      // MolstarViewer re-applies the theme whenever visible selections change,
      // so this snapshot is always fresh when the color callback runs.
      const keyColorMap = new Map<string, number>()
      for (const sel of useNamedSelectionStore.getState().selections) {
        if (!sel.visible) continue
        for (const key of sel.residues) keyColorMap.set(key, sel.color)
      }

      return {
        factory:     provider,
        granularity: 'group',
        color: (location: unknown) => {
          if (!StructureElement.Location.is(location)) return Color(DIM_GREY)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const loc = location as any
          try {
            const chain  = StructureProperties.chain.auth_asym_id(loc) as string
            const resNum = StructureProperties.residue.auth_seq_id(loc) as number
            const c      = keyColorMap.get(`${chain}:${resNum}`)
            if (c !== undefined) return Color(c)
          } catch { /* ignore */ }
          return Color(DIM_GREY)
        },
        props,
        description: 'Colors residues by their named selection accent color.',
      }
    },
    getParams:     () => ({}),
    defaultValues: {},
    isApplicable:  () => true,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  try { (registry as any).add(provider) } catch { /* already registered */ }
}
