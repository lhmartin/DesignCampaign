import { useEffect, useRef, useState } from 'react'
import { BookOpen, Square, RotateCcw, Copy, Check, Play } from 'lucide-react'
import { useMarimoContext } from '@/hooks/useMarimoContext'
import { useFileStore } from '@/stores/file-store'
import { getFileName } from '@/lib/utils'

type MarimoState = 'idle' | 'installing' | 'starting' | 'running' | 'error'

const LAST_NOTEBOOK_KEY = 'dc-marimo-last-notebook'

export function MarimoTab() {
  const [state, setState] = useState<MarimoState>('idle')
  const [port, setPort] = useState<number | null>(null)
  const [notebookPath, setNotebookPath] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [installLog, setInstallLog] = useState<string[]>([])
  const [copied, setCopied] = useState(false)
  const currentFolder = useFileStore(s => s.currentFolder)
  const [pathInput, setPathInput] = useState('')
  const installLogRef = useRef<HTMLDivElement>(null)
  const installCleanupRef = useRef<(() => void) | null>(null)
  const { contextPath } = useMarimoContext()

  // Clean up install progress listener if component unmounts mid-install
  useEffect(() => () => { installCleanupRef.current?.() }, [])

  useEffect(() => {
    if (!window.electronAPI) return
    window.electronAPI.marimoStatus().then(({ running, port: p }) => {
      if (running && p !== null) {
        const saved = localStorage.getItem(LAST_NOTEBOOK_KEY)
        if (saved) setNotebookPath(saved)
        setPort(p)
        setState('running')
      } else {
        const saved = localStorage.getItem(LAST_NOTEBOOK_KEY)
        if (saved) {
          setNotebookPath(saved)
          setPathInput(saved)
          startMarimo(saved).catch(err => {
            setErrorMsg(err instanceof Error ? err.message : String(err))
            setState('error')
          })
        } else {
          const folder = useFileStore.getState().currentFolder
          if (folder) setPathInput(folder + '/notebook.py')
          setState('idle')
        }
      }
    }).catch(() => setState('idle'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (state === 'idle' && !localStorage.getItem(LAST_NOTEBOOK_KEY) && currentFolder) {
      setPathInput(currentFolder + '/notebook.py')
    }
  }, [state, currentFolder])

  // Auto-scroll install log
  useEffect(() => {
    if (installLogRef.current) {
      installLogRef.current.scrollTop = installLogRef.current.scrollHeight
    }
  }, [installLog])

  function pickAndStart() {
    // Show the path input prompt instead of a native dialog
    setState('idle')
  }

  async function confirmPath() {
    const p = pathInput.trim()
    if (!p) return
    setNotebookPath(p)
    localStorage.setItem(LAST_NOTEBOOK_KEY, p)
    await startMarimo(p)
  }

  async function startMarimo(nbPath: string) {
    if (!window.electronAPI) {
      setErrorMsg('Electron API not available — open the app in Electron, not a browser.')
      setState('error')
      return
    }
    setState('starting')
    setErrorMsg(null)
    try {
      const result = await window.electronAPI.marimoStart(nbPath)
      setPort(result.port)
      setState('running')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Detect Python "No module named marimo" — not generic API errors
      if (msg.includes('No module named') || msg.includes('ModuleNotFoundError')) {
        await runInstall(nbPath)
      } else {
        setErrorMsg(msg)
        setState('error')
      }
    }
  }

  async function runInstall(nbPath: string) {
    if (!window.electronAPI) return
    setState('installing')
    setInstallLog([])

    const cleanup = window.electronAPI.onMarimoInstallProgress(msg => {
      if (msg.done) {
        installCleanupRef.current = null
        cleanup()
        startMarimo(nbPath)
      } else if (msg.message) {
        setInstallLog(prev => [...prev, msg.message!])
      }
    })
    installCleanupRef.current = cleanup

    const result = await window.electronAPI.marimoInstall()
    if (!result.ok) {
      installCleanupRef.current = null
      cleanup()
      setErrorMsg(result.error ?? 'Installation failed')
      setState('error')
    }
  }

  async function stop() {
    await window.electronAPI?.marimoStop()
    setPort(null)
    setState('idle')
  }

  async function reload() {
    if (!notebookPath) return
    await window.electronAPI?.marimoStop()
    setPort(null)
    await startMarimo(notebookPath)
  }

  function copyContextPath() {
    if (!contextPath) return
    navigator.clipboard.writeText(contextPath)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const notebookName = notebookPath ? getFileName(notebookPath) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Toolbar ── */}
      {state === 'running' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-secondary-bg)',
          flexShrink: 0,
          fontSize: 11,
        }}>
          <BookOpen size={12} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
          <span style={{ color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
            {notebookName ?? 'notebook.py'}
          </span>

          {contextPath && (
            <button
              onClick={copyContextPath}
              title={`Copy context path: ${contextPath}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                padding: '2px 6px', borderRadius: 4, fontSize: 10,
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
                background: 'transparent', cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {copied ? <Check size={10} /> : <Copy size={10} />}
              {copied ? 'Copied!' : 'dc_context.json'}
            </button>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button
              onClick={reload}
              title="Restart Marimo"
              style={toolbarBtnStyle}
            >
              <RotateCcw size={11} />
            </button>
            <button
              onClick={stop}
              title="Stop Marimo"
              style={toolbarBtnStyle}
            >
              <Square size={11} />
            </button>
          </div>
        </div>
      )}

      {/* ── Content ── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>

        {state === 'idle' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 32, width: '100%', maxWidth: 440 }}>
            <BookOpen size={28} style={{ color: 'var(--color-text-secondary)', opacity: 0.4 }} />
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
              Enter the path to a Marimo notebook (.py)
            </span>
            <div style={{ display: 'flex', gap: 6, width: '100%' }}>
              <input
                autoFocus
                value={pathInput}
                onChange={e => setPathInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmPath() }}
                placeholder={currentFolder ? `${currentFolder}/notebook.py` : '/path/to/notebook.py'}
                style={{
                  flex: 1,
                  padding: '5px 8px',
                  borderRadius: 5,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-background)',
                  color: 'var(--color-text)',
                  fontSize: 11,
                  fontFamily: 'JetBrains Mono, monospace',
                  outline: 'none',
                }}
              />
              <button onClick={confirmPath} style={primaryBtnStyle} disabled={!pathInput.trim()}>
                <Play size={11} />
                Open
              </button>
            </div>
            <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', opacity: 0.6 }}>
              File will be created if it does not exist
            </span>
          </div>
        )}

        {state === 'installing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 24, width: '100%', maxWidth: 480 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-secondary)' }}>
              <Spinner />
              Installing Marimo…
            </div>
            <div
              ref={installLogRef}
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                lineHeight: 1.6,
                color: 'var(--color-text-secondary)',
                background: 'var(--color-background)',
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                padding: '8px 10px',
                height: 200,
                overflowY: 'auto',
              }}
            >
              {installLog.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          </div>
        )}

        {state === 'starting' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-text-secondary)' }}>
            <Spinner />
            Starting Marimo…
          </div>
        )}

        {state === 'running' && port !== null && (
          <webview
            src={`http://127.0.0.1:${port}/`}
            style={{ width: '100%', height: '100%', flex: 1, border: 'none' }}
          />
        )}

        {state === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 24, maxWidth: 400 }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
              {errorMsg ?? 'An error occurred'}
            </span>
            <button onClick={() => notebookPath ? startMarimo(notebookPath) : pickAndStart()} style={primaryBtnStyle}>
              Retry
            </button>
            <button onClick={() => { localStorage.removeItem(LAST_NOTEBOOK_KEY); setPathInput(currentFolder ? currentFolder + '/notebook.py' : ''); setState('idle') }} style={secondaryBtnStyle}>
              Change notebook path
            </button>
          </div>
        )}

      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" style={{ animation: 'spin 0.8s linear infinite' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      <circle cx="7" cy="7" r="5" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeDasharray="20 12" />
    </svg>
  )
}

const toolbarBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '3px 6px', borderRadius: 4, fontSize: 10,
  color: 'var(--color-text-secondary)',
  border: '1px solid var(--color-border)',
  background: 'transparent', cursor: 'pointer',
}

const primaryBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '6px 14px', borderRadius: 6, fontSize: 12,
  color: 'var(--color-accent)',
  border: '1px solid var(--color-accent)',
  background: 'transparent', cursor: 'pointer',
}

const secondaryBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '4px 12px', borderRadius: 6, fontSize: 11,
  color: 'var(--color-text-secondary)',
  border: '1px solid var(--color-border)',
  background: 'transparent', cursor: 'pointer',
}
