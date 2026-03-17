import { useEffect, useState } from 'react'

type UpdateState = 'downloading' | 'ready' | null

/**
 * Thin banner that appears when electron-updater detects a new version.
 * - 'downloading' → "Downloading update…" (no action needed)
 * - 'ready'       → "Update ready — Restart to install" + [Restart] + [×]
 *
 * Only subscribes to IPC events when window.electronAPI is present (i.e. running
 * inside Electron, not a browser dev server).
 */
export function UpdateBanner() {
  const [state, setState] = useState<UpdateState>(null)

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return

    const cleanupAvailable  = api.onUpdateAvailable(() => setState('downloading'))
    const cleanupDownloaded = api.onUpdateDownloaded(() => setState('ready'))

    return () => {
      cleanupAvailable()
      cleanupDownloaded()
    }
  }, [])

  if (!state) return null

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '0 12px',
      height: 28,
      flexShrink: 0,
      background: state === 'ready'
        ? 'var(--color-accent)'
        : 'color-mix(in srgb, var(--color-accent) 40%, var(--color-secondary-bg))',
      color: state === 'ready' ? '#fff' : 'var(--color-text-primary)',
      fontSize: 11,
      fontWeight: 500,
    }}>
      {state === 'downloading' ? (
        <span>⬇ Downloading update…</span>
      ) : (
        <>
          <span>✓ Update ready — Restart to install</span>
          <button
            onClick={() => window.electronAPI?.installUpdate()}
            style={{
              padding: '1px 10px',
              borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.5)',
              background: 'rgba(255,255,255,0.2)',
              color: '#fff',
              fontSize: 11,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Restart
          </button>
          <button
            onClick={() => setState(null)}
            style={{
              marginLeft: 'auto',
              padding: '1px 6px',
              borderRadius: 4,
              border: 'none',
              background: 'transparent',
              color: 'rgba(255,255,255,0.8)',
              fontSize: 13,
              cursor: 'pointer',
              lineHeight: 1,
            }}
            title="Dismiss"
          >
            ×
          </button>
        </>
      )}
    </div>
  )
}
