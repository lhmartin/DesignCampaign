/**
 * Read --color-viewer-bg and parse "#rrggbb" → 0xrrggbb for Mol*.
 * Falls back to a deep navy if the variable is missing or malformed.
 */
export function readViewerBg(): number {
  if (typeof document === 'undefined') return 0x040812
  const css = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-viewer-bg').trim()
  const m = /^#?([0-9a-f]{6})$/i.exec(css)
  return m ? parseInt(m[1], 16) : 0x040812
}
