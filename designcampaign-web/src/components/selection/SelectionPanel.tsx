import { useMemo, useState, useCallback } from 'react'
import { Eye, EyeOff, Palette, Search as SearchIcon, X, MousePointer2 } from 'lucide-react'
import { useSelectionStore, type SelectionKey } from '@/stores/selection-store'
import { useInterfaceStore } from '@/stores/interface-store'
import { useFileStore } from '@/stores/file-store'
import { useSequenceStore } from '@/stores/sequence-store'
import { useNamedSelectionStore, type EpitopeSearchParams } from '@/stores/named-selection-store'
import { useViewerPrefsStore } from '@/stores/viewer-prefs-store'
import { downloadBlob, getFileStem } from '@/lib/utils'
import { PARATOPE_COLOR, EPITOPE_COLOR } from '@/components/viewer/themes/interface-theme'
import { hashSeq } from '@/lib/hash-seq'
import { readFileContent } from '@/lib/fsa'

/** Parse a "chainId:resId" key into its parts. */
function parseKey(key: SelectionKey): { chain: string; resId: number } {
  const idx = key.lastIndexOf(':')
  return { chain: key.slice(0, idx), resId: Number(key.slice(idx + 1)) }
}

/** Format a sorted array of integers as compact range notation, e.g. "1–5, 8, 10–12" */
function compactRanges(ids: number[]): string {
  if (ids.length === 0) return ''
  const ranges: string[] = []
  let start = ids[0], end = ids[0]
  for (let i = 1; i < ids.length; i++) {
    if (ids[i] === end + 1) {
      end = ids[i]
    } else {
      ranges.push(start === end ? `${start}` : `${start}–${end}`)
      start = end = ids[i]
    }
  }
  ranges.push(start === end ? `${start}` : `${start}–${end}`)
  return ranges.join(', ')
}

/** Group a set of SelectionKeys by chain, returning sorted Map<chain, sortedResIds[]>. */
function groupByChain(keys: Set<SelectionKey>): Map<string, number[]> {
  const map = new Map<string, number[]>()
  for (const key of keys) {
    const { chain, resId } = parseKey(key)
    if (!map.has(chain)) map.set(chain, [])
    map.get(chain)!.push(resId)
  }
  for (const ids of map.values()) ids.sort((a, b) => a - b)
  return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

// ── Named interface group (epitope or paratope) ───────────────────────────────

function InterfaceGroup({
  label, filename, keys, accentColor,
}: {
  label: string; filename: string; keys: Set<SelectionKey>; accentColor: string
}) {
  const byChain = useMemo(() => groupByChain(keys), [keys])

  const handleExport = () => {
    const lines = [`# ${label} — ${filename}`]
    for (const [chain, ids] of byChain) lines.push(`Chain ${chain}: ${ids.join(', ')}`)
    downloadBlob(lines.join('\n'), `${label.toLowerCase().replace(/\s+/g, '-')}.txt`)
  }

  const handleSelectInViewer = () => {
    useSelectionStore.getState().selectAll(Array.from(keys))
  }

  return (
    <div style={{ borderBottom: '1px solid var(--color-border)' }}>
      <div style={{
        position: 'sticky', top: 0,
        padding: '6px 12px',
        background: `color-mix(in srgb, ${accentColor} 8%, var(--color-secondary-bg))`,
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: accentColor }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: accentColor, flex: 1 }}>{label}</span>
        <span style={{ fontSize: 10, color: 'var(--color-text-disabled)' }}>{keys.size} res</span>
        <button onClick={handleSelectInViewer} title="Highlight in viewer" style={{
          fontSize: 9, padding: '1px 6px', borderRadius: 4,
          border: `1px solid ${accentColor}40`, background: 'transparent', color: accentColor, cursor: 'pointer',
        }}>Select</button>
        <button onClick={handleExport} title="Export as text file" style={{
          fontSize: 9, padding: '1px 6px', borderRadius: 4,
          border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer',
        }}>Export</button>
      </div>
      {[...byChain.entries()].map(([chain, ids]) => (
        <div key={chain}>
          <div style={{ padding: '3px 12px', display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-secondary-bg)' }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Chain {chain}
            </span>
            <span style={{ fontSize: 10, color: 'var(--color-text-disabled)', marginLeft: 'auto', fontFamily: 'JetBrains Mono, monospace' }}>
              {compactRanges(ids)}
            </span>
          </div>
          <div style={{ padding: '4px 8px', display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {ids.map(id => (
              <span key={id} style={{
                padding: '1px 5px', borderRadius: 6, fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
                background: `color-mix(in srgb, ${accentColor} 12%, transparent)`,
                color: accentColor, border: `1px solid ${accentColor}30`,
              }}>{id}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Save as epitope section ────────────────────────────────────────────────────

function SaveEpitopeSection({ selectedResidues }: { selectedResidues: Set<SelectionKey> }) {
  const [name, setName]           = useState('')
  const [selectedChain, setChain] = useState<string | null>(null)
  const [saving, setSaving]       = useState(false)
  const activeFile  = useFileStore(s => s.activeFile)
  const chainSeqs   = useSequenceStore(s => activeFile ? s.sequences.get(activeFile) : null) ?? null
  const { save }    = useNamedSelectionStore()

  const byChain = useMemo(() => groupByChain(selectedResidues), [selectedResidues])
  const chains  = Array.from(byChain.keys())
  const effectiveChain = selectedChain ?? chains[0] ?? null

  const handleSave = useCallback(async () => {
    if (!effectiveChain) return
    setSaving(true)
    try {
      const chainSeq = chainSeqs?.find(c => c.chain === effectiveChain)?.seq ?? ''
      const hash     = await hashSeq(chainSeq)
      const residues = Array.from(selectedResidues).filter(k => parseKey(k).chain === effectiveChain)
      save(name || `Selection ${new Date().toLocaleTimeString()}`, residues, effectiveChain, hash)
      setName('')
    } finally {
      setSaving(false)
    }
  }, [effectiveChain, selectedResidues, chainSeqs, name, save])

  return (
    <div style={{
      padding: '8px 10px',
      borderBottom: '1px solid var(--color-border)',
      background: 'color-mix(in srgb, var(--color-accent) 4%, var(--color-secondary-bg))',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Save as Named Epitope
      </div>

      {/* Chain picker (only when multiple chains selected) */}
      {chains.length > 1 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', alignSelf: 'center' }}>Chain:</span>
          {chains.map(c => (
            <button key={c} onClick={() => setChain(c)} style={{
              padding: '2px 8px', borderRadius: 4, fontSize: 10,
              fontFamily: 'Outfit, sans-serif', fontWeight: 600,
              border: `1px solid ${effectiveChain === c ? 'var(--color-accent)' : 'var(--color-border)'}`,
              background: effectiveChain === c ? 'color-mix(in srgb, var(--color-accent) 15%, transparent)' : 'transparent',
              color: effectiveChain === c ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}>{c} ({byChain.get(c)?.length ?? 0})</button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && void handleSave()}
          placeholder={effectiveChain ? `Name for chain ${effectiveChain} selection…` : 'Name…'}
          style={{
            flex: 1, fontSize: 11, fontFamily: 'Outfit, sans-serif',
            padding: '3px 7px', borderRadius: 4, outline: 'none',
            border: '1px solid var(--color-border)',
            background: 'var(--color-background)',
            color: 'var(--color-text-primary)',
          }}
        />
        <button
          onClick={() => void handleSave()}
          disabled={saving || !effectiveChain}
          style={{
            padding: '3px 10px', borderRadius: 4, fontSize: 10,
            fontFamily: 'Outfit, sans-serif', fontWeight: 600,
            border: '1px solid var(--color-accent)',
            background: 'color-mix(in srgb, var(--color-accent) 20%, transparent)',
            color: 'var(--color-accent)',
            cursor: saving ? 'wait' : 'pointer',
            flexShrink: 0,
          }}
        >
          {saving ? '…' : 'Save'}
        </button>
      </div>

      {effectiveChain && byChain.get(effectiveChain) && (
        <div style={{ fontSize: 9, color: 'var(--color-text-disabled)' }}>
          {byChain.get(effectiveChain)!.length} residues on chain {effectiveChain}
        </div>
      )}
    </div>
  )
}

// ── Search panel for one named selection ──────────────────────────────────────

function SearchPanel({ selId }: { selId: string }) {
  const { searchParams, searchState, setSearchParams, runSearch, openSearch } = useNamedSelectionStore()
  const requestLoadFile = useViewerPrefsStore(s => s.requestLoadFile)
  const files    = useFileStore(s => s.files)
  const state    = searchState[selId]
  const running  = state?.running ?? false
  const results  = state?.results ?? []
  const error    = state?.error ?? null
  const progress = state?.progress ?? 0
  const total    = state?.total ?? 0

  const handleRun = () => {
    const targets = files.map(f => ({ name: getFileStem(f.name), filePath: f.path }))
    void runSearch(selId, targets, readFileContent)
  }

  return (
    <div style={{
      padding: '8px 10px',
      borderTop: '1px solid var(--color-border)',
      background: 'var(--color-secondary-bg)',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      {/* Params */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {/* Cutoff */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--color-text-secondary)' }}>
          Cutoff
          <input
            type="number" min={1} max={20} step={0.5}
            value={searchParams.cutoff}
            onChange={e => setSearchParams({ cutoff: Number(e.target.value) })}
            style={{
              width: 44, fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
              padding: '2px 4px', borderRadius: 4,
              border: '1px solid var(--color-border)',
              background: 'var(--color-background)',
              color: 'var(--color-text-primary)',
              outline: 'none',
            }}
          />
          Å
        </label>

        {/* Atom scope */}
        <select
          value={searchParams.atomScope}
          onChange={e => setSearchParams({ atomScope: e.target.value as EpitopeSearchParams['atomScope'] })}
          style={{
            fontSize: 10, fontFamily: 'Outfit, sans-serif', padding: '2px 4px', borderRadius: 4,
            border: '1px solid var(--color-border)', background: 'var(--color-background)',
            color: 'var(--color-text-primary)', outline: 'none', cursor: 'pointer',
          }}
        >
          <option value="ca">CA only</option>
          <option value="all-heavy">All heavy</option>
          <option value="backbone">Backbone</option>
        </select>

        {/* Match mode */}
        <select
          value={searchParams.matchMode}
          onChange={e => setSearchParams({ matchMode: e.target.value as EpitopeSearchParams['matchMode'] })}
          style={{
            fontSize: 10, fontFamily: 'Outfit, sans-serif', padding: '2px 4px', borderRadius: 4,
            border: '1px solid var(--color-border)', background: 'var(--color-background)',
            color: 'var(--color-text-primary)', outline: 'none', cursor: 'pointer',
          }}
        >
          <option value="any">Any contact</option>
          <option value="all">All residues</option>
          <option value="count">≥ N residues</option>
          <option value="percentage">≥ % residues</option>
        </select>

        {/* Threshold input for count/percentage modes */}
        {(searchParams.matchMode === 'count' || searchParams.matchMode === 'percentage') && (
          <input
            type="number" min={0} max={searchParams.matchMode === 'percentage' ? 100 : 9999} step={1}
            value={searchParams.matchValue}
            onChange={e => setSearchParams({ matchValue: Number(e.target.value) })}
            style={{
              width: 48, fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
              padding: '2px 4px', borderRadius: 4,
              border: '1px solid var(--color-border)',
              background: 'var(--color-background)',
              color: 'var(--color-text-primary)',
              outline: 'none',
            }}
          />
        )}
      </div>

      {/* Run button */}
      <button
        onClick={handleRun}
        disabled={running || files.length === 0}
        style={{
          alignSelf: 'flex-start',
          padding: '4px 12px', borderRadius: 4, fontSize: 10,
          fontFamily: 'Outfit, sans-serif', fontWeight: 600,
          border: '1px solid var(--color-accent)',
          background: running ? 'transparent' : 'color-mix(in srgb, var(--color-accent) 20%, transparent)',
          color: 'var(--color-accent)',
          cursor: running ? 'wait' : 'pointer',
        }}
      >
        {running ? `Searching… ${Math.round(progress * 100)}% (${Math.round(progress * total)}/${total})` : `Run search (${files.length} files)`}
      </button>

      {/* Error */}
      {error && (
        <div style={{ fontSize: 10, color: 'rgba(239,68,68,0.9)', padding: '3px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
          {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 10, color: 'var(--color-text-disabled)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
            {results.length} hit{results.length !== 1 ? 's' : ''} — sorted by coverage
          </div>
          <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 4 }}>
            {results.map((hit, i) => (
              <button
                key={i}
                onClick={() => requestLoadFile(hit.filePath)}
                title={`Open ${hit.name} in viewer`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  width: '100%', textAlign: 'left',
                  padding: '5px 8px',
                  borderBottom: i < results.length - 1 ? '1px solid var(--color-border)' : 'none',
                  border: 'none',
                  background: i % 2 === 0 ? 'transparent' : 'var(--color-secondary-bg)',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--color-accent) 10%, transparent)')}
                onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'var(--color-secondary-bg)')}
              >
                <span style={{ fontSize: 10, flex: 1, fontFamily: 'Outfit, sans-serif', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {hit.name}
                </span>
                <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'var(--color-accent)', flexShrink: 0 }}>
                  {hit.hitCount}/{hit.totalCount} ({Math.round(hit.hitFraction * 100)}%)
                </span>
                <span style={{ fontSize: 9, color: 'var(--color-text-disabled)', flexShrink: 0 }}>↗</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!running && !error && results.length === 0 && state && (
        <div style={{ fontSize: 10, color: 'var(--color-text-disabled)' }}>No hits found with current settings.</div>
      )}

      <button
        onClick={() => openSearch(null)}
        style={{
          alignSelf: 'flex-start', fontSize: 9, padding: '2px 8px', borderRadius: 4,
          border: '1px solid var(--color-border)', background: 'transparent',
          color: 'var(--color-text-secondary)', cursor: 'pointer',
        }}
      >
        Close
      </button>
    </div>
  )
}

// ── Named selections list ─────────────────────────────────────────────────────

function NamedSelectionRow({ sel }: { sel: import('@/stores/named-selection-store').NamedSelection }) {
  const { rename, remove, toggleVisible, openSearch, openSearchId } = useNamedSelectionStore()
  const { colorScheme, setColorScheme } = useViewerPrefsStore()
  const isColorActive = colorScheme === 'named-selection'
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(sel.name)
  const isOpen = openSearchId === sel.id
  const hex = `#${sel.color.toString(16).padStart(6, '0')}`

  const commitEdit = () => {
    rename(sel.id, editName)
    setEditing(false)
  }

  return (
    <div style={{ borderBottom: '1px solid var(--color-border)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 10px',
        background: isOpen ? 'color-mix(in srgb, var(--color-accent) 5%, var(--color-secondary-bg))' : 'transparent',
      }}>
        {/* Color swatch */}
        <div style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: hex, border: '1px solid rgba(255,255,255,0.15)' }} />

        {/* Name */}
        {editing ? (
          <input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { setEditName(sel.name); setEditing(false) } }}
            autoFocus
            style={{
              flex: 1, fontSize: 10, fontFamily: 'Outfit, sans-serif',
              padding: '1px 4px', borderRadius: 3, outline: 'none',
              border: '1px solid var(--color-accent)',
              background: 'var(--color-background)',
              color: 'var(--color-text-primary)',
            }}
          />
        ) : (
          <span
            onClick={() => { setEditName(sel.name); setEditing(true) }}
            title="Click to rename"
            style={{ flex: 1, fontSize: 10, fontFamily: 'Outfit, sans-serif', color: 'var(--color-text-primary)', cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {sel.name}
          </span>
        )}

        {/* Chain badge */}
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 99, flexShrink: 0,
          background: `${hex}22`, color: hex, border: `1px solid ${hex}44`,
        }}>
          {sel.chainId}
        </span>

        {/* Visible toggle */}
        <button
          onClick={() => toggleVisible(sel.id)}
          title={sel.visible ? 'Hide in viewer' : 'Show in viewer'}
          style={{
            width: 20, height: 20, borderRadius: 4, flexShrink: 0,
            border: `1px solid ${sel.visible ? hex + '60' : 'var(--color-border)'}`,
            background: sel.visible ? `${hex}18` : 'transparent',
            color: sel.visible ? hex : 'var(--color-text-disabled)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {sel.visible ? <Eye size={11} strokeWidth={1.75} /> : <EyeOff size={11} strokeWidth={1.75} />}
        </button>

        {/* Color in viewer toggle */}
        <button
          onClick={() => setColorScheme(isColorActive ? 'sequence-id' : 'named-selection')}
          title={isColorActive ? 'Switch back to default coloring' : 'Color epitope residues in 3D viewer'}
          style={{
            width: 20, height: 20, borderRadius: 4, flexShrink: 0,
            border: `1px solid ${isColorActive ? hex + '80' : 'var(--color-border)'}`,
            background: isColorActive ? `${hex}25` : 'transparent',
            color: isColorActive ? hex : 'var(--color-text-disabled)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Palette size={11} strokeWidth={1.75} />
        </button>

        {/* Search toggle */}
        <button
          onClick={() => openSearch(isOpen ? null : sel.id)}
          title="Search for binders contacting this epitope"
          style={{
            width: 20, height: 20, borderRadius: 4, flexShrink: 0,
            border: `1px solid ${isOpen ? 'var(--color-accent)' : 'var(--color-border)'}`,
            background: isOpen ? 'color-mix(in srgb, var(--color-accent) 18%, transparent)' : 'transparent',
            color: isOpen ? 'var(--color-accent)' : 'var(--color-text-secondary)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <SearchIcon size={11} strokeWidth={1.75} />
        </button>

        {/* Delete */}
        <button
          onClick={() => remove(sel.id)}
          title="Remove this named selection"
          style={{
            width: 20, height: 20, borderRadius: 4, flexShrink: 0,
            border: '1px solid var(--color-border)',
            background: 'transparent', color: 'var(--color-text-disabled)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <X size={11} strokeWidth={1.75} />
        </button>
      </div>

      {/* Residue count hint */}
      <div style={{ padding: '0 10px 4px 26px', fontSize: 10, color: 'var(--color-text-disabled)' }}>
        {sel.residues.length} residue{sel.residues.length !== 1 ? 's' : ''}
      </div>

      {/* Inline search panel */}
      {isOpen && <SearchPanel selId={sel.id} />}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function SelectionPanel() {
  const { selectedResidues, clearSelection } = useSelectionStore()
  const paratope       = useInterfaceStore(s => s.paratope)
  const epitope        = useInterfaceStore(s => s.epitope)
  const nHBonds        = useInterfaceStore(s => s.nHBonds)
  const nClashes       = useInterfaceStore(s => s.nClashes)
  const paratopeProps  = useInterfaceStore(s => s.paratopeProps)
  const epitopeProps   = useInterfaceStore(s => s.epitopeProps)
  const cutoff         = useInterfaceStore(s => s.cutoff)
  const { activeFile } = useFileStore()
  const selections = useNamedSelectionStore(s => s.selections)

  const filename = activeFile?.split('/').pop() ?? 'unknown'
  const byChain  = useMemo(() => groupByChain(selectedResidues), [selectedResidues])

  const totalSelected = selectedResidues.size
  const hasInterface  = paratope.size > 0 || epitope.size > 0
  const hasNamedSels  = selections.length > 0

  const handleExportList = () => {
    const lines: string[] = [`# Selected residues — ${filename}`]
    for (const [chain, ids] of byChain) lines.push(`Chain ${chain}: ${ids.join(', ')}`)
    downloadBlob(lines.join('\n'), 'selection.txt')
  }

  return (
    <div className="flex flex-col h-full text-xs text-[var(--color-text-primary)]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] shrink-0">
        <span className="font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide text-[11px]">
          Selection
        </span>
        {totalSelected > 0 && (
          <span className="ml-auto px-1.5 py-0.5 rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent)] font-mono text-[11px]">
            {totalSelected}
          </span>
        )}
        {totalSelected > 0 && (
          <>
            <button
              onClick={handleExportList}
              className="px-2 py-0.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-secondary-bg)] transition-colors"
              title="Export selection as text"
            >Export</button>
            <button
              onClick={clearSelection}
              className="px-2 py-0.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-secondary-bg)] transition-colors text-red-500 hover:text-red-600"
              title="Clear all selected residues"
            >Clear</button>
          </>
        )}
      </div>

      {/* Empty state */}
      {totalSelected === 0 && !hasInterface && !hasNamedSels && (
        <div className="flex flex-col items-center justify-center flex-1 text-[var(--color-text-disabled)] gap-2 px-6 text-center">
          <MousePointer2 size={28} className="opacity-40" />
          <p>Click residues in the 3D viewer to select them.</p>
          <p className="text-[11px]">Hold <kbd className="px-1 py-0.5 rounded bg-[var(--color-secondary-bg)] border border-[var(--color-border)] font-mono">Ctrl</kbd> to add/remove individual residues.</p>
          <p className="text-[11px] mt-1 text-[var(--color-text-disabled)]">Use the <strong>Interface</strong> button in the viewer toolbar to detect epitope &amp; paratope residues.</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* ── Save as Epitope ── */}
        {totalSelected > 0 && (
          <SaveEpitopeSection selectedResidues={selectedResidues} />
        )}

        {/* ── Named Selections ── */}
        {hasNamedSels && (
          <div>
            <div style={{
              padding: '5px 12px',
              fontSize: 10, fontWeight: 600,
              color: 'var(--color-text-secondary)',
              textTransform: 'uppercase', letterSpacing: '0.04em',
              borderBottom: '1px solid var(--color-border)',
              background: 'var(--color-secondary-bg)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              Named Epitopes
              <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'var(--color-text-disabled)' }}>
                {selections.length}
              </span>
            </div>
            {selections.map(sel => <NamedSelectionRow key={sel.id} sel={sel} />)}
          </div>
        )}

        {/* ── Interface analysis summary ── */}
        {hasInterface && (
          <div style={{ borderBottom: '1px solid var(--color-border)' }}>
            <div style={{
              padding: '5px 12px',
              fontSize: 11, fontWeight: 600,
              color: 'var(--color-text-secondary)',
              textTransform: 'uppercase', letterSpacing: '0.04em',
              borderBottom: '1px solid var(--color-border)',
              background: 'var(--color-secondary-bg)',
            }}>
              Interface Analysis
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '6px 12px', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--color-text-primary)', fontWeight: 600 }}>{nHBonds}</span>
                {' '}H-bonds
              </span>
              <span style={{ color: 'var(--color-border)' }}>·</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', color: nClashes > 0 ? '#f59e0b' : 'var(--color-text-primary)', fontWeight: 600 }}>{nClashes}</span>
                {' '}clash{nClashes !== 1 ? 'es' : ''}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
                <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{cutoff} Å</span>
                {' '}cutoff
              </span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '4px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--color-text-disabled)', fontSize: 10 }}></th>
                  <th style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600, color: PARATOPE_COLOR, fontSize: 10 }}>Paratope</th>
                  <th style={{ padding: '4px 12px 4px 8px', textAlign: 'right', fontWeight: 600, color: EPITOPE_COLOR, fontSize: 10 }}>Epitope</th>
                </tr>
              </thead>
              <tbody>
                {([
                  { label: 'Residues',        a: paratope.size,              b: epitope.size,               mono: true },
                  { label: 'Net charge',      a: paratopeProps.charge > 0 ? `+${paratopeProps.charge}` : paratopeProps.charge, b: epitopeProps.charge > 0 ? `+${epitopeProps.charge}` : epitopeProps.charge, mono: true },
                  { label: 'Hydrophobicity',  a: paratopeProps.hydrophobicity, b: epitopeProps.hydrophobicity, mono: true },
                  { label: 'Aromatic',        a: paratopeProps.aromatic,     b: epitopeProps.aromatic,       mono: true },
                  { label: 'Polar / NP',      a: `${paratopeProps.polar} / ${paratopeProps.nonpolar}`, b: `${epitopeProps.polar} / ${epitopeProps.nonpolar}`, mono: true },
                ] as Array<{ label: string; a: string | number; b: string | number; mono?: boolean }>).map(row => (
                  <tr key={row.label} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '3px 12px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>{row.label}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right', fontFamily: row.mono ? 'JetBrains Mono, monospace' : undefined, color: 'var(--color-text-primary)', fontWeight: 500 }}>
                      {row.a}
                    </td>
                    <td style={{ padding: '3px 12px 3px 8px', textAlign: 'right', fontFamily: row.mono ? 'JetBrains Mono, monospace' : undefined, color: 'var(--color-text-primary)', fontWeight: 500 }}>
                      {row.b}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Interface groups ── */}
        {paratope.size > 0 && (
          <InterfaceGroup label="Paratope (binder)" filename={filename} keys={paratope} accentColor={PARATOPE_COLOR} />
        )}
        {epitope.size > 0 && (
          <InterfaceGroup label="Epitope (target)" filename={filename} keys={epitope} accentColor={EPITOPE_COLOR} />
        )}

        {/* ── Manual selection ── */}
        {totalSelected > 0 && (
          <div>
            {(hasInterface || hasNamedSels) && (
              <div style={{
                padding: '5px 12px', fontSize: 10, fontWeight: 600,
                color: 'var(--color-text-secondary)',
                textTransform: 'uppercase', letterSpacing: '0.04em',
                borderBottom: '1px solid var(--color-border)',
                background: 'var(--color-secondary-bg)',
              }}>
                Manual Selection
              </div>
            )}
            {[...byChain.entries()].map(([chain, ids]) => (
              <div key={chain}>
                <div className="sticky top-0 px-3 py-1 bg-[var(--color-secondary-bg)] border-b border-[var(--color-border)] flex items-center gap-2">
                  <span className="font-semibold text-[var(--color-text-secondary)] text-[11px] uppercase tracking-wide">
                    Chain {chain}
                  </span>
                  <span className="text-[11px] text-[var(--color-text-disabled)]">{ids.length} residue{ids.length !== 1 ? 's' : ''}</span>
                  <span className="ml-auto text-[11px] font-mono text-[var(--color-text-secondary)]">
                    {compactRanges(ids)}
                  </span>
                </div>
                <div className="p-2 flex flex-wrap gap-1">
                  {ids.map(id => (
                    <button
                      key={id}
                      onClick={() => {
                        const key: SelectionKey = `${chain}:${id}`
                        const next = new Set(useSelectionStore.getState().selectedResidues)
                        next.delete(key)
                        useSelectionStore.setState({ selectedResidues: next })
                      }}
                      title={`Remove ${chain}:${id} from selection`}
                      className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/25 hover:bg-red-50 hover:border-red-200 hover:text-red-600 dark:hover:bg-red-950/30 transition-colors"
                    >
                      {id}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
