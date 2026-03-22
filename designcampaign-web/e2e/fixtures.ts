/**
 * Custom Playwright fixtures for DesignCampaign Electron tests.
 *
 * Usage:
 *   import { test, expect } from '../fixtures'
 *
 * Provides:
 *   - `app`  — ElectronApplication instance (launched once per test, closed after)
 *   - `win`  — The main BrowserWindow Page, loaded and ready for interaction
 *
 * Isolation:
 *   Each test gets a fresh temporary `--user-data-dir` so localStorage,
 *   IndexedDB, and window-state.json don't leak between tests.
 *
 * Window size:
 *   The window is resized to 1600×900 after first load so the full tab bar
 *   is always visible (38% left panel ≈ 608px — enough for all 8 tabs).
 */
import { test as base, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { createRequire } from 'module'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// Resolve the electron binary that ships with the project's devDependencies.
const electronExecutable = require('electron') as string

// Path to the compiled Electron main entry (built by `npm run build:vite`).
const APP_MAIN = path.join(__dirname, '../dist-electron/main.js')

type E2EFixtures = {
  app: ElectronApplication
  win: Page
}

export const test = base.extend<E2EFixtures>({
  // Launch a fresh Electron process for each test, close it afterwards.
  // --user-data-dir points at a temp directory so localStorage and
  // window-state.json are always clean (no cross-test contamination).
  // E2E_TEST=1 tells ipc-handlers to skip real Python env detection so the
  // PythonSetupModal never appears.
  app: async ({}, use) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dc-e2e-'))
    const electronApp = await electron.launch({
      executablePath: electronExecutable,
      args: [APP_MAIN, `--user-data-dir=${tmpDir}`],
      env: {
        ...process.env,
        E2E_TEST: '1',
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
    })
    await use(electronApp)
    await electronApp.close()
    // Brief pause between Electron launches to let GPU/WebGL resources release.
    await new Promise(r => setTimeout(r, 300))
    fs.rmSync(tmpDir, { recursive: true, force: true })
  },

  // Return the first window, resize to 1600×900 so the full tab bar fits,
  // then wait for the React app to finish mounting.
  win: async ({ app }, use) => {
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Ensure a consistent window size across all tests so tab-bar overflow
    // never hides tabs from the test runner.
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1600, 900)
    })

    await use(window)
  },
})

export { expect } from '@playwright/test'
