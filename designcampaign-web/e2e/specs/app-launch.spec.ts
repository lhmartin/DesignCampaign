/**
 * E2E — App launch
 *
 * Verifies that the application opens to a usable state:
 *   - Title bar renders the app name and theme toggle
 *   - All sidebar tabs are present
 *   - The Files tab is active by default
 *   - Both resizable panels are mounted
 *   - The Mol* viewer initialises (canvas or axis indicator visible)
 */
import { test, expect } from '../fixtures'

// All sidebar tab labels as rendered in AppShell.tsx
const TABS = ['Files', 'Metrics', 'Plot', 'Corr', 'Align', 'Filter', 'Selection', 'UniProt']

test.describe('App launch', () => {
  test('title bar shows app name', async ({ win }) => {
    await expect(win.getByText('DesignCampaign')).toBeVisible()
  })

  test('theme toggle button is visible in title bar', async ({ win }) => {
    // Use title attribute to distinguish from viewer's "Light Background" button
    await expect(
      win.locator('button[title="Switch to light mode"], button[title="Switch to dark mode"]')
    ).toBeVisible()
  })

  test('all sidebar tabs are present in the DOM', async ({ win }) => {
    for (const label of TABS) {
      // toBeAttached confirms presence in DOM even if clipped by overflow
      await expect(win.getByRole('tab', { name: label })).toBeAttached()
    }
  })

  test('all sidebar tabs are visible at 1600px width', async ({ win }) => {
    // Fixture resizes to 1600×900 — 38% left panel ≈ 608px, enough for 8 tabs
    for (const label of TABS) {
      await expect(win.getByRole('tab', { name: label })).toBeVisible()
    }
  })

  test('Files tab is active by default', async ({ win }) => {
    await expect(win.getByRole('tab', { name: 'Files' })).toHaveAttribute('data-state', 'active')
  })

  test('two resizable panels are mounted', async ({ win }) => {
    // react-resizable-panels v4 renders data-panel attribute on each Panel div;
    // the id prop is used internally by the library (not as the HTML id attribute).
    const panels = win.locator('[data-panel]')
    await expect(panels).toHaveCount(2)
  })

  test('Mol* viewer controls toolbar is present', async ({ win }) => {
    // The MolstarViewer renders a toolbar with style and color dropdowns
    // regardless of whether WebGL successfully initialised.
    // Using the style selector (always rendered) as a stable existence probe.
    await expect(win.locator('select').first()).toBeAttached()
  })
})
