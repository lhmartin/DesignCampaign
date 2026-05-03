import { useEffect, useState } from 'react'
import type { CloudConnectionMeta, AddConnectionInput } from '@/types/electron'

interface Props {
  onConnect: (id: string) => void
  onClose: () => void
}

type View = 'list' | 'add'
type Provider = 'azure' | 'gcs'

export function CloudConnectionDialog({ onConnect, onClose }: Props) {
  const [view, setView] = useState<View>('list')
  const [connections, setConnections] = useState<CloudConnectionMeta[]>([])

  useEffect(() => {
    window.electronAPI?.cloudListConnections().then(setConnections)
  }, [])

  const handleDelete = async (id: string) => {
    await window.electronAPI?.cloudDeleteConnection(id)
    setConnections(prev => prev.filter(c => c.id !== id))
  }

  const handleSaved = (meta: CloudConnectionMeta) => {
    setConnections(prev => [...prev, meta])
    setView('list')
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: 520,
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-secondary-bg)',
        borderRadius: 12,
        border: '1px solid var(--color-border)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {view === 'add' ? 'Add Cloud Connection' : 'Cloud Storage'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 18, lineHeight: 1, padding: 2 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {view === 'list'
            ? <ListView connections={connections} onConnect={onConnect} onDelete={handleDelete} onAdd={() => setView('add')} />
            : <AddView onSaved={handleSaved} onCancel={() => setView('list')} />
          }
        </div>
      </div>
    </div>
  )
}

// ── List view ─────────────────────────────────────────────────────────────────

function ListView({ connections, onConnect, onDelete, onAdd }: {
  connections: CloudConnectionMeta[]
  onConnect: (id: string) => void
  onDelete: (id: string) => void
  onAdd: () => void
}) {
  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {connections.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', textAlign: 'center', padding: '24px 0' }}>
          No cloud connections saved yet.
        </p>
      )}
      {connections.map(conn => (
        <ConnectionRow key={conn.id} conn={conn} onConnect={onConnect} onDelete={onDelete} />
      ))}
      <button
        onClick={onAdd}
        style={{
          marginTop: 4,
          padding: '8px 14px',
          borderRadius: 6,
          border: '1px dashed var(--color-border)',
          background: 'none',
          cursor: 'pointer',
          fontSize: 12,
          color: 'var(--color-text-secondary)',
          width: '100%',
        }}
      >
        + Add New Connection
      </button>
    </div>
  )
}

function ConnectionRow({ conn, onConnect, onDelete }: {
  conn: CloudConnectionMeta
  onConnect: (id: string) => void
  onDelete: (id: string) => void
}) {
  const displayUrl = conn.provider === 'azure'
    ? conn.azureBaseUrl ?? 'Azure Blob'
    : `gs://${conn.gcsBucket ?? ''}${conn.gcsPrefix ? '/' + conn.gcsPrefix : ''}`

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px',
      borderRadius: 8,
      border: '1px solid var(--color-border)',
      background: 'var(--color-primary-bg)',
    }}>
      <ProviderBadge provider={conn.provider} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 2 }}>{conn.label}</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayUrl}</div>
      </div>
      <button
        onClick={() => onConnect(conn.id)}
        style={{
          padding: '5px 12px', borderRadius: 5,
          background: 'var(--color-accent)', color: 'white',
          border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, flexShrink: 0,
        }}
      >
        Connect
      </button>
      <button
        onClick={() => onDelete(conn.id)}
        title="Delete connection"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-disabled)', padding: 4, flexShrink: 0 }}
      >
        <TrashIcon />
      </button>
    </div>
  )
}

// ── Add view ──────────────────────────────────────────────────────────────────

function AddView({ onSaved, onCancel }: {
  onSaved: (meta: CloudConnectionMeta) => void
  onCancel: () => void
}) {
  const [provider, setProvider] = useState<Provider>('azure')
  const [label, setLabel] = useState('')
  const [sasUrl, setSasUrl] = useState('')
  const [azurePrefix, setAzurePrefix] = useState('')
  const [gcsBucket, setGcsBucket] = useState('')
  const [gcsPrefix, setGcsPrefix] = useState('')
  const [saJson, setSaJson] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; fileCount?: number } | null>(null)
  const [saving, setSaving] = useState(false)

  const resetTestResult = () => setTestResult(null)

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    const input = provider === 'azure'
      ? { provider: 'azure' as const, sasUrl, azurePrefix: azurePrefix || undefined }
      : { provider: 'gcs' as const, serviceAccountJson: saJson, gcsBucket, gcsPrefix: gcsPrefix || undefined }
    const result = await window.electronAPI!.cloudTestConnection(input)
    setTestResult(result)
    setTesting(false)
  }

  const handleSave = async () => {
    setSaving(true)
    const input: AddConnectionInput = provider === 'azure'
      ? { provider: 'azure', label, sasUrl, azurePrefix: azurePrefix || undefined }
      : { provider: 'gcs', label, serviceAccountJson: saJson, gcsBucket, gcsPrefix: gcsPrefix || undefined }
    const result = await window.electronAPI!.cloudAddConnection(input)
    if (result.ok && result.id) {
      const connections = await window.electronAPI!.cloudListConnections()
      const meta = connections.find(c => c.id === result.id)
      if (meta) onSaved(meta)
    } else {
      setTestResult({ ok: false, error: result.error ?? 'Failed to save' })
    }
    setSaving(false)
  }

  const canTest = provider === 'azure' ? !!sasUrl : !!saJson && !!gcsBucket
  const canSave = !!label && testResult?.ok === true

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Provider tabs */}
      <div style={{ display: 'flex', gap: 0, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--color-border)', alignSelf: 'flex-start' }}>
        {(['azure', 'gcs'] as Provider[]).map(p => (
          <button
            key={p}
            onClick={() => { setProvider(p); resetTestResult() }}
            style={{
              padding: '6px 16px', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer',
              background: provider === p ? 'var(--color-accent)' : 'var(--color-primary-bg)',
              color: provider === p ? 'white' : 'var(--color-text-secondary)',
            }}
          >
            {p === 'azure' ? 'Azure Blob' : 'Google Cloud'}
          </button>
        ))}
      </div>

      {/* Label */}
      <Field label="Connection Name">
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="e.g. SBDD Designs"
          style={inputStyle}
        />
      </Field>

      {/* Provider-specific fields */}
      {provider === 'azure' ? (
        <>
          <Field label="SAS URL" hint="Generate in Azure Portal with Read + List permissions on the container">
            <input
              type="password"
              value={sasUrl}
              onChange={e => { setSasUrl(e.target.value); resetTestResult() }}
              placeholder="https://account.blob.core.windows.net/container?sv=..."
              style={inputStyle}
            />
          </Field>
          <Field label="Prefix (optional)" hint="Limit listing to a path prefix, e.g. campaign-2024/">
            <input
              value={azurePrefix}
              onChange={e => { setAzurePrefix(e.target.value); resetTestResult() }}
              placeholder="folder/"
              style={inputStyle}
            />
          </Field>
        </>
      ) : (
        <>
          <Field label="Bucket Name">
            <input
              value={gcsBucket}
              onChange={e => { setGcsBucket(e.target.value); resetTestResult() }}
              placeholder="my-protein-designs"
              style={inputStyle}
            />
          </Field>
          <Field label="Prefix (optional)" hint="Limit listing to a path prefix, e.g. campaign-2024/">
            <input
              value={gcsPrefix}
              onChange={e => { setGcsPrefix(e.target.value); resetTestResult() }}
              placeholder="folder/"
              style={inputStyle}
            />
          </Field>
          <Field label="Service Account JSON Key" hint="Service account must have Storage Object Viewer role">
            <textarea
              value={saJson}
              onChange={e => { setSaJson(e.target.value); resetTestResult() }}
              placeholder='{ "type": "service_account", "project_id": "...", ... }'
              rows={5}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 11 }}
            />
          </Field>
        </>
      )}

      {/* Test result banner */}
      {testResult && (
        <div style={{
          padding: '8px 12px',
          borderRadius: 6,
          fontSize: 12,
          background: testResult.ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
          color: testResult.ok ? '#16a34a' : '#dc2626',
          border: `1px solid ${testResult.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
        }}>
          {testResult.ok
            ? `✓ Connected — found ${testResult.fileCount ?? 0} blob${testResult.fileCount !== 1 ? 's' : ''}`
            : `✗ ${testResult.error ?? 'Connection failed'}`}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
        <button onClick={onCancel} style={secondaryBtnStyle}>Cancel</button>
        <button
          onClick={handleTest}
          disabled={!canTest || testing}
          style={{ ...secondaryBtnStyle, opacity: (!canTest || testing) ? 0.5 : 1 }}
        >
          {testing ? 'Testing…' : 'Test Connection'}
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          style={{ ...primaryBtnStyle, opacity: (!canSave || saving) ? 0.5 : 1 }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>{label}</label>
      {hint && <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: -2 }}>{hint}</span>}
      {children}
    </div>
  )
}

function ProviderBadge({ provider }: { provider: Provider }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 6px',
      borderRadius: 4, flexShrink: 0,
      background: provider === 'azure' ? 'rgba(0,120,212,0.15)' : 'rgba(66,133,244,0.15)',
      color: provider === 'azure' ? '#0078d4' : '#4285f4',
    }}>
      {provider === 'azure' ? 'Azure' : 'GCS'}
    </span>
  )
}

function TrashIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '7px 10px',
  borderRadius: 6,
  border: '1px solid var(--color-border)',
  background: 'var(--color-primary-bg)',
  color: 'var(--color-text-primary)',
  fontSize: 12,
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
}

const primaryBtnStyle: React.CSSProperties = {
  padding: '7px 16px', borderRadius: 6,
  background: 'var(--color-accent)', color: 'white',
  border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
}

const secondaryBtnStyle: React.CSSProperties = {
  padding: '7px 16px', borderRadius: 6,
  background: 'var(--color-primary-bg)',
  color: 'var(--color-text-primary)',
  border: '1px solid var(--color-border)',
  cursor: 'pointer', fontSize: 12,
}
