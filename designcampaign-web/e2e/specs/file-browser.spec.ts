/**
 * E2E — File browser
 *
 * Verifies the Files tab in the default (no-folder-loaded) state:
 *   - Empty-state prompt is visible
 *   - "Open Folder" button is present and clickable
 *
 * Note: actually opening a native folder dialog is not tested here because
 * it requires OS-level interaction. The goal is to confirm the UI renders
 * correctly before any folder is selected.
 */
import { test, expect } from '../fixtures'

test.describe('File browser', () => {
  // Files tab is the default — no navigation needed, but be explicit
  test.beforeEach(async ({ win }) => {
    await win.getByRole('tab', { name: 'Files' }).click()
    await expect(win.getByRole('tabpanel')).toBeVisible()
  })

  test('shows empty-state prompt when no folder is open', async ({ win }) => {
    await expect(win.getByText('Open a folder containing PDB or CIF files')).toBeVisible()
  })

  test('Open Folder button is visible and enabled', async ({ win }) => {
    const btn = win.getByRole('button', { name: /open folder/i })
    await expect(btn).toBeVisible()
    await expect(btn).toBeEnabled()
  })

  test('Open Folder button is accessible via keyboard focus', async ({ win }) => {
    const btn = win.getByRole('button', { name: /open folder/i })
    await btn.focus()
    await expect(btn).toBeFocused()
  })
})
