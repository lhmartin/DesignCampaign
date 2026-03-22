/**
 * E2E — Theme toggle
 *
 * Verifies that clicking the dark/light button in the title bar:
 *   - Changes the `dark` class on the <html> element
 *   - Updates the button title accordingly
 *   - Toggles back correctly on a second click
 *
 * Uses `getByTitle` to uniquely target the title-bar toggle (the viewer
 * controls also contain a "Light Background" button that would otherwise
 * create a strict-mode violation with a text/role-based locator).
 */
import { test, expect } from '../fixtures'

test.describe('Theme toggle', () => {
  test('starts in dark mode by default (fresh user-data-dir)', async ({ win }) => {
    // Fresh localStorage → theme is not 'light' → isDark defaults to true
    const html = win.locator('html')
    await expect(html).toHaveClass(/dark/)

    // Title-bar toggle invites the user to switch TO light
    await expect(win.getByTitle('Switch to light mode')).toBeVisible()
  })

  test('switches to light mode when clicked', async ({ win }) => {
    const toggle = win.getByTitle('Switch to light mode')
    await toggle.click()

    await expect(win.locator('html')).not.toHaveClass(/dark/)
    // Button now invites switching back TO dark
    await expect(win.getByTitle('Switch to dark mode')).toBeVisible()
  })

  test('switches back to dark mode on second click', async ({ win }) => {
    // Click → light
    await win.getByTitle('Switch to light mode').click()
    // Click → dark
    await win.getByTitle('Switch to dark mode').click()

    await expect(win.locator('html')).toHaveClass(/dark/)
    await expect(win.getByTitle('Switch to light mode')).toBeVisible()
  })
})
