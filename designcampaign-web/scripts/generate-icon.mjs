#!/usr/bin/env node
/**
 * scripts/generate-icon.mjs
 * One-time script: converts resources/icon.svg → resources/icon.png (512×512).
 *
 * Requires: npm install --save-dev sharp
 * Run:      node scripts/generate-icon.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = join(__dirname, '..')
const SVG_PATH  = join(ROOT, 'resources', 'icon.svg')
const PNG_PATH  = join(ROOT, 'resources', 'icon.png')

if (!existsSync(SVG_PATH)) {
  console.error('[generate-icon] resources/icon.svg not found')
  process.exit(1)
}

let sharp
try {
  sharp = (await import('sharp')).default
} catch {
  console.error('[generate-icon] sharp is not installed. Run: npm install --save-dev sharp')
  process.exit(1)
}

const svg = readFileSync(SVG_PATH)
await sharp(svg).resize(512, 512).png().toFile(PNG_PATH)
console.log('[generate-icon] Written:', PNG_PATH)
