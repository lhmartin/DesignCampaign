/**
 * Playwright global setup — runs once before all E2E tests.
 *
 * Builds the Electron app (renderer + main) when `dist-electron/main.js` is
 * absent so tests can run without a manual build step.  If the build already
 * exists it is reused to keep iteration fast.
 *
 * Note: `--minify false` is used to work around a Vite/rollup segfault that
 * occurs when bundling Mol* + Plotly with full minification under Node.js v25
 * in memory-constrained environments.  The resulting bundles are larger but
 * functionally identical for testing purposes.
 */
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

export default async function globalSetup(): Promise<void> {
  const mainJs = path.join(ROOT, 'dist-electron/main.js')
  if (!fs.existsSync(mainJs)) {
    console.log('\n[E2E] dist-electron/main.js not found — building app...')
    execSync(
      'NODE_OPTIONS="--max-old-space-size=8192" node node_modules/.bin/vite build --minify false',
      { cwd: ROOT, stdio: 'inherit' }
    )
    console.log('[E2E] Build complete.\n')
  } else {
    console.log('[E2E] Using existing build at dist-electron/main.js')
  }
}
