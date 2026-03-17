/**
 * Interface-contacts color theme for Mol*.
 * Paratope residues (binder side) → sky-400 cyan  (#38bdf8)
 * Epitope  residues (target side) → red-400 coral (#f87171)
 * Other residues                  → gray-500      (#6b7280)
 *
 * Colors are read live from interface-store on every render so the view
 * updates immediately after a calculation without re-applying the theme.
 */
import { useInterfaceStore } from '@/stores/interface-store'

export const INTERFACE_THEME_ID = 'interface-contacts'

// Shared color constants — also used by InterfaceMenu and SelectionPanel
export const PARATOPE_COLOR = '#38bdf8'   // sky-400 cyan
export const EPITOPE_COLOR  = '#f87171'   // red-400 coral

const PARATOPE_HEX = 0x38bdf8
const EPITOPE_HEX  = 0xf87171
const OTHER_HEX    = 0x6b7280

export async function registerInterfaceTheme(
  plugin: import('molstar/lib/mol-plugin-ui/context').PluginUIContext,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { StructureElement, StructureProperties } = await import('molstar/lib/mol-model/structure') as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { Color } = await import('molstar/lib/mol-util/color') as any

  const registry = plugin.representation.structure.themes.colorThemeRegistry
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  try { if ((registry as any).has(INTERFACE_THEME_ID)) return } catch { /* ignore */ }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provider: any = {
    name: INTERFACE_THEME_ID,
    label: 'Interface Contacts',
    category: 'Custom',
    factory: (_ctx: unknown, props: unknown) => ({
      factory: provider,
      granularity: 'group',
      color: (location: unknown) => {
        if (!StructureElement.Location.is(location)) return Color(OTHER_HEX)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const loc = location as any
        try {
          const chain = StructureProperties.chain.auth_asym_id(loc)
          const resId = StructureProperties.residue.auth_seq_id(loc)
          const key   = `${chain}:${resId}`
          // Read from store without subscribing — theme re-evaluates on every frame
          const state = useInterfaceStore.getState()
          if (state.paratope.has(key)) return Color(PARATOPE_HEX)
          if (state.epitope.has(key))  return Color(EPITOPE_HEX)
        } catch { /* fall through */ }
        return Color(OTHER_HEX)
      },
      props,
      description: 'Paratope (binder contacts) = cyan, Epitope (target contacts) = coral, other = grey.',
    }),
    getParams: () => ({}),
    defaultValues: {},
    isApplicable: () => true,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  try { (registry as any).add(provider) } catch { /* already registered on HMR reload */ }
}
