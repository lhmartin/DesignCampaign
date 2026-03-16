/**
 * pLDDT 4-band color theme for Mol*.
 * Matches the AlphaFold confidence color convention and the SequenceViewer's plddtColor().
 *
 * Score >  90  → #0053d6  (dark blue  — Very High)
 * Score >  70  → #65cbf3  (cyan       — Confident)
 * Score >  50  → #ffdb13  (yellow     — Low)
 * Score <= 50  → #ff7d45  (orange     — Very Low)
 * No score     → #888898  (gray)
 */

const NO_SCORE   = 0x888898
const ORANGE     = 0xff7d45  // Very Low  (≤ 50)
const YELLOW     = 0xffdb13  // Low       (51–70)
const CYAN       = 0x65cbf3  // Confident (71–90)
const DARK_BLUE  = 0x0053d6  // Very High (> 90)

function plddtHexColor(score: number): number {
  if (score > 90) return DARK_BLUE
  if (score > 70) return CYAN
  if (score > 50) return YELLOW
  return ORANGE
}

export async function registerPlddtTheme(
  plugin: import('molstar/lib/mol-plugin-ui/context').PluginUIContext,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { StructureElement } = await import('molstar/lib/mol-model/structure') as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { Color } = await import('molstar/lib/mol-util/color') as any

  const registry = plugin.representation.structure.themes.colorThemeRegistry
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  try { if ((registry as any).has('plddt-bands')) return } catch { /* ignore */ }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provider: any = {
    name: 'plddt-bands',
    label: 'pLDDT / B-factor (bands)',
    category: 'Custom',
    factory: (_ctx: unknown, props: unknown) => ({
      factory: provider,
      granularity: 'group',
      color: (location: unknown) => {
        if (!StructureElement.Location.is(location)) return Color(NO_SCORE)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const loc = location as any
        try {
          const bFactor = loc.unit.model.atomicConformation.B_iso_or_equiv.value(loc.element)
          if (typeof bFactor === 'number' && isFinite(bFactor) && bFactor >= 0) {
            return Color(plddtHexColor(bFactor))
          }
        } catch { /* fall through */ }
        return Color(NO_SCORE)
      },
      props,
      description: 'AlphaFold pLDDT 4-band coloring using the B-factor column. Very High (>90) dark blue, Confident (>70) cyan, Low (>50) yellow, Very Low (≤50) orange.',
    }),
    getParams: () => ({}),
    defaultValues: {},
    isApplicable: () => true,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  try { (registry as any).add(provider) } catch { /* already registered on HMR reload */ }
}
