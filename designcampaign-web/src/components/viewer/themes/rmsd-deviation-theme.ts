/**
 * RMSD deviation color theme for Mol*.
 * Per-residue Cα displacement from the reference structure after optimal superposition.
 *
 *   0 Å  → white   (0xffffff — identical)
 *   1 Å  → orange  (0xf97316 — moderate deviation)
 *  ≥3 Å  → red     (0xef4444 — high deviation)
 *  n/a   → grey    (0x888898 — no data / unmatched residue)
 */

const NO_DATA = 0x888898

/** Linear-interpolate between two RGB triplets; clamp t to [0,1]. */
function lerpHex(t: number, from: [number, number, number], to: [number, number, number]): number {
  const tc = Math.max(0, Math.min(1, t))
  const r  = Math.round(from[0] + tc * (to[0] - from[0]))
  const g  = Math.round(from[1] + tc * (to[1] - from[1]))
  const b  = Math.round(from[2] + tc * (to[2] - from[2]))
  return (r << 16) | (g << 8) | b
}

/** Deviation (Å) → hex colour on white → orange → red ramp, saturating at 3 Å. */
function rmsdHexColor(dev: number): number {
  const t = Math.min(1, dev / 3)
  return t <= 0.5
    ? lerpHex(t * 2,       [255, 255, 255], [249, 115,  22])  // white → orange
    : lerpHex((t - 0.5) * 2, [249, 115,  22], [239,  68,  68])  // orange → red
}

export async function registerRmsdDeviationTheme(
  plugin: import('molstar/lib/mol-plugin-ui/context').PluginUIContext,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { StructureElement, StructureProperties } = await import('molstar/lib/mol-model/structure') as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { Color } = await import('molstar/lib/mol-util/color') as any
  const { useRmsdStore }  = await import('@/stores/rmsd-store')
  const { useFileStore }  = await import('@/stores/file-store')

  const registry = plugin.representation.structure.themes.colorThemeRegistry
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  try { if ((registry as any).has('rmsd-deviation')) return } catch { /* ignore */ }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provider: any = {
    name:     'rmsd-deviation',
    label:    'RMSD Deviation',
    category: 'Custom',
    factory: (_ctx: unknown, props: unknown) => ({
      factory:     provider,
      granularity: 'group',
      color: (location: unknown) => {
        if (!StructureElement.Location.is(location)) return Color(NO_DATA)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const loc = location as any
        try {
          const activeFile = useFileStore.getState().activeFile
          if (!activeFile) return Color(NO_DATA)
          const devMap = useRmsdStore.getState().deviationsByPath.get(activeFile)
          if (!devMap) return Color(NO_DATA)
          const chain  = StructureProperties.chain.auth_asym_id(loc) as string
          const resNum = StructureProperties.residue.auth_seq_id(loc) as number
          const dev    = devMap.get(`${chain}:${resNum}`)
          if (dev === undefined) return Color(NO_DATA)
          return Color(rmsdHexColor(dev))
        } catch { return Color(NO_DATA) }
      },
      props,
      description: 'Per-residue Cα RMSD deviation from reference structure after optimal superposition. White=0Å, Orange=1Å, Red≥3Å.',
    }),
    getParams:     () => ({}),
    defaultValues: {},
    isApplicable:  () => true,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  try { (registry as any).add(provider) } catch { /* already registered on HMR reload */ }
}
