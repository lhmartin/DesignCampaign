import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist-electron/**', '**/dist/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Use the pre-built browser bundle — same as vite.config.ts
      'plotly.js': path.resolve(__dirname, 'node_modules/plotly.js/dist/plotly.min.js'),
    },
  },
  define: {
    global: 'globalThis',
  },
})
