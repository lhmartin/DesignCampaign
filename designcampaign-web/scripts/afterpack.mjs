/**
 * scripts/afterpack.mjs
 * electron-builder afterPack hook — runs after each arch is packaged,
 * before @electron/universal merges them.
 *
 * For macOS universal builds, prepare-uv.mjs downloads two thin binaries:
 *   uv-dist/uv-x64   (x86_64)
 *   uv-dist/uv-arm64 (arm64)
 *
 * This hook copies the arch-appropriate thin binary to uv-dist/uv inside
 * the packed app, then removes the arch-tagged files so the bundle is clean.
 * @electron/universal then sees different Mach-O files in each half and
 * correctly merges them into a fat binary.
 */
import { copyFileSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// electron-builder Arch enum: 0=ia32, 1=x64, 2=armv7l, 3=arm64
const ARCH_X64   = 1
const ARCH_ARM64 = 3

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const resourcesDir = join(
    context.appOutDir,
    'DesignCampaign.app',
    'Contents',
    'Resources',
    'uv-dist',
  )

  const archName = context.arch === ARCH_ARM64 ? 'arm64' : 'x64'
  const srcBin  = join(resourcesDir, `uv-${archName}`)
  const destBin = join(resourcesDir, 'uv')

  if (!existsSync(srcBin)) {
    console.warn(`[afterpack] Warning: expected ${srcBin} — skipping uv rename`)
    return
  }

  copyFileSync(srcBin, destBin)

  // Remove the arch-tagged files from the bundle so the final app only has "uv".
  for (const name of ['uv-x64', 'uv-arm64']) {
    const f = join(resourcesDir, name)
    if (existsSync(f)) unlinkSync(f)
  }

  console.log(`[afterpack] Installed uv-${archName} as uv in ${resourcesDir}`)
}
