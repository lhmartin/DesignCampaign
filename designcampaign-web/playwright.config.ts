import { defineConfig } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  testDir: path.join(__dirname, 'e2e/specs'),
  globalSetup: path.join(__dirname, 'e2e/global-setup.ts'),

  // Electron apps must run in a single worker — multiple windows would conflict.
  workers: 1,
  fullyParallel: false,

  // Retry once on failure to handle intermittent Electron GPU/WebGL crashes
  // that occur when launching many Electron processes sequentially.
  retries: 1,

  timeout: 30_000,
  expect: { timeout: 10_000 },

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'e2e/report' }],
  ],

  use: {
    screenshot: 'only-on-failure',
    video: 'off',
  },
})
