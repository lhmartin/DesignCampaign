import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
        vite: {
          build: {
            rollupOptions: {
              output: {
                // CJS content must use .cjs extension in an "type":"module" package
                entryFileNames: '[name].cjs',
              },
            },
          },
        },
      },
      renderer: process.env.NODE_ENV === 'test' ? undefined : {},
    }),
  ],
  server: {
    watch: {
      // Marimo writes session files here — ignore to prevent spurious reloads
      ignored: [/__marimo__/, /notebook\.py/],
    },
  },
  // Polyfill Node.js `global` for CJS libraries (plotly.js, etc.) in browser/renderer
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Use the pre-built browser UMD bundle — the CJS source requires Node.js
      // built-ins (events, etc.) that are not available in the browser/renderer.
      'plotly.js': path.resolve(__dirname, 'node_modules/plotly.js/dist/plotly.min.js'),
    },
  },
  build: {
    // Mol* and Plotly chunks are large by design — suppress the default 500 kB warning
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('molstar')) return 'molstar'
          if (id.includes('plotly')) return 'plotly'
        },
      },
    },
  },
})
