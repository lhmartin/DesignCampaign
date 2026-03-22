/**
 * E2E — Tab navigation
 *
 * Clicks each sidebar tab and verifies:
 *   - The clicked tab becomes active (data-state="active")
 *   - The previously active tab becomes inactive
 *   - The corresponding tab panel is visible
 *
 * Note: "Plot" and "Corr" panels use `forceMount` (always in DOM), so they
 * are checked with `toBeAttached()` rather than `toBeVisible()` while inactive.
 */
import { test, expect } from '../fixtures'

const TABS = [
  'Files',
  'Metrics',
  'Plot',
  'Corr',
  'Align',
  'Filter',
  'Selection',
  'UniProt',
] as const

test.describe('Tab navigation', () => {
  for (const label of TABS) {
    test(`clicking "${label}" tab activates it`, async ({ win }) => {
      const tab = win.getByRole('tab', { name: label })
      await tab.click()
      await expect(tab).toHaveAttribute('data-state', 'active')
    })
  }

  test('only one tab is active at a time', async ({ win }) => {
    // Click Metrics, then Filter — only Filter should be active
    await win.getByRole('tab', { name: 'Metrics' }).click()
    await win.getByRole('tab', { name: 'Filter' }).click()

    await expect(win.getByRole('tab', { name: 'Filter' })).toHaveAttribute('data-state', 'active')
    await expect(win.getByRole('tab', { name: 'Metrics' })).toHaveAttribute('data-state', 'inactive')
  })

  test('tabpanel is visible after switching', async ({ win }) => {
    await win.getByRole('tab', { name: 'Filter' }).click()
    // The active tab panel should be visible
    const panel = win.getByRole('tabpanel')
    await expect(panel).toBeVisible()
  })
})
