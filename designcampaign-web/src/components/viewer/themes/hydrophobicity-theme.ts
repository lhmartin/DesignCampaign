// Kyte-Doolittle hydrophobicity scale
const HYDROPHOBICITY: Record<string, number> = {
  ALA: 1.8, ARG: -4.5, ASN: -3.5, ASP: -3.5, CYS: 2.5,
  GLN: -3.5, GLU: -3.5, GLY: -0.4, HIS: -3.2, ILE: 4.5,
  LEU: 3.8, LYS: -3.9, MET: 1.9, PHE: 2.8, PRO: -1.6,
  SER: -0.8, THR: -0.7, TRP: -0.9, TYR: -1.3, VAL: 4.2,
}

function bwrColor(t: number): number {
  const c = Math.max(0, Math.min(1, t))
  let r: number, g: number, b: number
  if (c < 0.5) {
    const s = c * 2
    r = Math.round(s * 255); g = Math.round(s * 255); b = 255
  } else {
    const s = (c - 0.5) * 2
    r = 255; g = Math.round((1 - s) * 255); b = Math.round((1 - s) * 255)
  }
  return (r << 16) | (g << 8) | b
}

export async function registerHydrophobicityTheme(plugin: import('molstar/lib/mol-plugin-ui/context').PluginUIContext) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { StructureElement, StructureProperties } = await import('molstar/lib/mol-model/structure') as any
  const { Color } = await import('molstar/lib/mol-util/color') as any

  const registry = plugin.representation.structure.themes.colorThemeRegistry
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  try { if ((registry as any).has('hydrophobicity')) return } catch { /* ignore */ }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provider: any = {
    name: 'hydrophobicity',
    label: 'Hydrophobicity',
    category: 'Custom',
    factory: (_ctx: unknown, props: unknown) => ({
      factory: provider,
      granularity: 'group',
      color: (location: unknown) => {
        if (!StructureElement.Location.is(location))
          return Color(0x808080)
        const loc = location
        const compId = StructureProperties.atom.label_comp_id(loc)
        const value = HYDROPHOBICITY[compId] ?? 0
        return Color(bwrColor((value + 4.5) / 9.0))
      },
      props,
      description: 'Kyte-Doolittle hydrophobicity (blue=hydrophilic, red=hydrophobic)',
    }),
    getParams: () => ({}),
    defaultValues: {},
    isApplicable: () => true,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  try { (registry as any).add(provider) } catch { /* already registered on HMR reload */ }
}
