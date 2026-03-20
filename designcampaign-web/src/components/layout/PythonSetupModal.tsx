import { useEffect, useRef, useState } from 'react'

type State = 'running' | 'done' | 'error'

interface Props {
  onComplete: () => void
  onDismiss:  () => void
}

export function PythonSetupModal({ onComplete, onDismiss }: Props) {
  const [state,    setState]    = useState<State>('running')
  const [progress, setProgress] = useState<string[]>([])
  const [error,    setError]    = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  // Python setup requires the Electron desktop app.
  if (!window.electronAPI) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 400, background: 'var(--color-secondary-bg)',
          border: '1px solid var(--color-border)', borderRadius: 12,
          padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'Outfit, sans-serif' }}>
            Desktop app required
          </h2>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            CDR annotation via AntPack requires the DesignCampaign desktop app. Python setup is not available in the browser.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={onDismiss} style={{
              fontSize: 12, padding: '5px 14px', borderRadius: 6,
              border: '1px solid var(--color-border)',
              background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer',
            }}>Close</button>
          </div>
        </div>
      </div>
    )
  }

  const start = async () => {
    setState('running')
    setError(null)
    setProgress([])

    const result = await window.electronAPI.runPythonSetup()
    if (result.ok) {
      setState('done')
      setTimeout(onComplete, 1200)
    } else {
      setState('error')
      setError(result.error ?? 'Unknown error')
    }
  }

  useEffect(() => {
    start()
    const cleanup = window.electronAPI!.onPythonSetupProgress(msg => {
      setProgress(prev => [...prev, msg])
      // Auto-scroll log to bottom
      requestAnimationFrame(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
      })
    })
    return cleanup
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 480,
        background: 'var(--color-secondary-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        padding: '24px 28px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        {/* Header */}
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'Outfit, sans-serif' }}>
            {state === 'done' ? '✓ Python environment ready' : 'Setting up Python environment'}
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--color-text-secondary)' }}>
            {state === 'done'
              ? 'CDR analysis is now available.'
              : 'DesignCampaign uses uv to create an isolated Python 3.11 environment with AntPack. This only happens once.'}
          </p>
        </div>

        {/* Progress log */}
        <div
          ref={logRef}
          style={{
            height: 160,
            overflowY: 'auto',
            background: 'var(--color-background)',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            padding: '8px 10px',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11,
            color: state === 'error' ? '#f87171' : 'var(--color-text-secondary)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {progress.length === 0 && state === 'running' && (
            <span style={{ color: 'var(--color-text-disabled)' }}>Starting…</span>
          )}
          {progress.map((line, i) => <span key={i}>{line}</span>)}
          {state === 'error' && error && (
            <span style={{ color: '#f87171', marginTop: 4 }}>Error: {error}</span>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          {state === 'running' && (
            <span style={{ fontSize: 11, color: 'var(--color-text-disabled)', marginRight: 'auto' }}>
              Downloading Python if needed — may take a minute…
            </span>
          )}
          {state === 'error' && (
            <button
              onClick={start}
              style={{
                fontSize: 12, padding: '5px 14px', borderRadius: 6,
                border: '1px solid color-mix(in srgb, var(--color-accent) 50%, transparent)',
                background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
                color: 'var(--color-accent)', cursor: 'pointer',
              }}
            >
              Retry
            </button>
          )}
          <button
            onClick={onDismiss}
            style={{
              fontSize: 12, padding: '5px 14px', borderRadius: 6,
              border: '1px solid var(--color-border)',
              background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer',
            }}
          >
            {state === 'done' ? 'Close' : 'Skip for now'}
          </button>
        </div>
      </div>
    </div>
  )
}
