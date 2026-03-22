/**
 * E2E — Filter panel
 *
 * Verifies the Filter tab UI in its empty (no-folder-loaded) state:
 *   - "Filters" section header is visible
 *   - Empty-state message is present
 *   - "+ Metric" and "+ Residue" add-rule buttons are present
 *   - "Ranking" collapsible section toggle works
 *   - "Presets" section header is visible
 */
import { test, expect } from '../fixtures'

test.describe('Filter panel', () => {
  test.beforeEach(async ({ win }) => {
    await win.getByRole('tab', { name: 'Filter' }).click()
    // Confirm the active tabpanel rendered — use first() since Plot/Corr are forceMount'd
    await expect(win.getByRole('tabpanel').first()).toBeVisible()
  })

  test('shows empty-state message when no rules exist', async ({ win }) => {
    await expect(win.getByText('No filter rules. Add one below.')).toBeVisible()
  })

  test('shows "Filters" section header', async ({ win }) => {
    // exact:true avoids matching the tablist whose text content includes "Filter"
    await expect(win.getByText('Filters', { exact: true })).toBeVisible()
  })

  test('"+ Metric" add-rule button is present', async ({ win }) => {
    await expect(win.getByRole('button', { name: '+ Metric' })).toBeVisible()
  })

  test('"+ Residue" add-rule button is present', async ({ win }) => {
    await expect(win.getByRole('button', { name: '+ Residue' })).toBeVisible()
  })

  test('shows "Ranking" section toggle', async ({ win }) => {
    // The ranking header is a <button> whose text content starts with "Ranking".
    // Use locator().filter() to distinguish it from "Apply Ranking".
    const rankingToggle = win.locator('button').filter({ hasText: /^Ranking/i })
    await expect(rankingToggle).toBeVisible()
  })

  test('shows "Presets" section header', async ({ win }) => {
    await expect(win.getByText('Presets', { exact: true })).toBeVisible()
  })

  test('Ranking section expands on click', async ({ win }) => {
    const rankingToggle = win.locator('button').filter({ hasText: /^Ranking/i })
    await rankingToggle.click()
    // After expanding, the "Rank sum" mode button appears
    await expect(win.getByRole('button', { name: 'Rank sum' })).toBeVisible()
  })
})
