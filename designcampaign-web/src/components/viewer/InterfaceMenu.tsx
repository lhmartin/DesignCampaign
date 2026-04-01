import { useRef, useEffect, useState, useCallback } from 'react'
import { useInterfaceStore } from '@/stores/interface-store'
import { useUIStore } from '@/stores/ui-store'
import { useGroupStore } from '@/stores/group-store'
import { useFileStore } from '@/stores/file-store'
import { useMetricsStore } from '@/stores/metrics-store'
import { useBatchInterfaceStore } from '@/stores/batch-interface-store'
import { extractAtomsFromPlugin, computeContacts } from '@/lib/interface-calc'
import { readFileContent } from '@/lib/fsa'

import { getFileStem } from '@/lib/utils'
import type { WorkerBatchInput, WorkerFileResult } from '@/workers/interface-calc.worker'
import { INTERFACE_THEME_ID, PARATOPE_COLOR, EPITOPE_COLOR } from './themes/interface-theme'
import { applyToAllRepresentations } from './MolstarViewer'

type PluginUIContext = import('molstar/lib/mol-plugin-ui/context').PluginUIContext

// ── Module-level constants ────────────────────────────────────────────────────

const calcBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: 5, padding: '5px 10px', borderRadius: 5, fontSize: 10,
  border: '1px solid var(--color-border)',
  background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
  color: 'var(--color-accent)', cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
  fontWeight: 600,
}
const disabledBtn: React.CSSProperties = { ...calcBtn, opacity: 0.5, cursor: 'not-allowed' }
const secondaryBtn: React.CSSProperties = { ...calcBtn, background: 'transparent', color: 'var(--color-text-secondary)' }

const BATCH_SIZE = 10   // files read in parallel per batch

// ── Chain management helpers ──────────────────────────────────────────────────

/** Get all unique chain IDs from the currently loaded Mol* structure. */
function getChainsFromPlugin(plugin: PluginUIContext): string[] {
  try {
    const structures = (plugin as any).managers.structure.hierarchy.current.structures
    if (structures.length === 0) return []
    const structure = (structures[0].cell.obj as any)?.data
    if (!structure) return []
    const seen = new Set<string>()
    for (const unit of structure.units as any[]) {
      if (unit.kind !== 0) continue
      const chainIdCol   = unit.model?.atomicHierarchy?.chains?.auth_asym_id
      const chainAtomSeg = unit.model?.atomicHierarchy?.chainAtomSegments
      if (!chainIdCol?.value || !chainAtomSeg?.index) continue
      for (let i = 0; i < unit.elements.length; i++) {
        const atomIdx  = unit.elements[i]
        const chainIdx = chainAtomSeg.index[atomIdx]
        const chain    = chainIdCol.value(chainIdx) as string
        if (chain) seen.add(chain)
      }
    }
    return Array.from(seen).sort()
  } catch {
    return []
  }
}

/** Try to auto-classify chains via group-store hash analysis. */
function detectChainsFromGroups(activeFile: string | null): { binder: string[]; target: string[] } | null {
  if (!activeFile) return null
  const { hashResults, groups } = useGroupStore.getState()
  const result = hashResults.get(activeFile)
  if (!result) return null
  const group = groups.find(g => g.members.includes(activeFile))
  if (!group) return null
  const targetHashSet = new Set(group.id.split(':'))
  const target = Object.entries(result.chainHashes).filter(([, h]) => targetHashSet.has(h)).map(([c]) => c)
  const binder = Object.entries(result.chainHashes).filter(([, h]) => !targetHashSet.has(h)).map(([c]) => c)
  return { binder, target }
}

// ── Chain chip list ───────────────────────────────────────────────────────────

function ChainSelector({
  label,
  selected,
  allChains,
  onChange,
}: {
  label: string
  selected: string[]
  allChains: string[]
  onChange: (chains: string[]) => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const available = allChains.filter(c => !selected.includes(c))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontWeight: 600 }}>{label}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        {selected.map(chain => (
          <span
            key={chain}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '1px 6px', borderRadius: 8,
              background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)',
              color: 'var(--color-accent)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
              border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
            }}
          >
            {chain}
            <button
              onClick={() => onChange(selected.filter(c => c !== chain))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'inherit', opacity: 0.7 }}
              title={`Remove chain ${chain}`}
            >✕</button>
          </span>
        ))}

        {available.length > 0 && (
          showAdd ? (
            <select
              autoFocus
              size={1}
              onChange={e => { if (e.target.value) { onChange([...selected, e.target.value]); setShowAdd(false) } }}
              onBlur={() => setShowAdd(false)}
              style={{
                fontSize: 10, padding: '1px 4px', borderRadius: 4,
                border: '1px solid var(--color-border)',
                background: 'var(--color-background)',
                color: 'var(--color-text-primary)',
              }}
            >
              <option value="">pick…</option>
              {available.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              style={{
                fontSize: 10, padding: '1px 8px', borderRadius: 8,
                border: '1px dashed var(--color-border)',
                background: 'transparent',
                color: 'var(--color-text-disabled)', cursor: 'pointer',
              }}
            >+ add</button>
          )
        )}

        {selected.length === 0 && !showAdd && available.length === 0 && (
          <span style={{ fontSize: 10, color: 'var(--color-text-disabled)', fontStyle: 'italic' }}>no chains loaded</span>
        )}
      </div>
    </div>
  )
}

// ── Icon ──────────────────────────────────────────────────────────────────────

function IconInterface({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <circle cx="3.5" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="10.5" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="6" y1="7" x2="8" y2="7" stroke="currentColor" strokeWidth="1.2" strokeDasharray="1.5 0.8" />
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function InterfaceMenu({ plugin }: { plugin: PluginUIContext }) {
  const [open, setOpen]           = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null)
  const panelRef  = useRef<HTMLDivElement>(null)
  const workerRef = useRef<Worker | null>(null)

  // Spin up the contact-calc worker once; terminate on unmount
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../../workers/interface-calc.worker.ts', import.meta.url),
      { type: 'module' },
    )
    return () => { workerRef.current?.terminate(); workerRef.current = null }
  }, [])

  // Store — data only (individual selectors to avoid snapshot instability)
  const binderChains  = useInterfaceStore(s => s.binderChains)
  const targetChains  = useInterfaceStore(s => s.targetChains)
  const cutoff        = useInterfaceStore(s => s.cutoff)
  const atomScope     = useInterfaceStore(s => s.atomScope)
  const paratope      = useInterfaceStore(s => s.paratope)
  const epitope       = useInterfaceStore(s => s.epitope)
  const nHBonds       = useInterfaceStore(s => s.nHBonds)
  const nClashes      = useInterfaceStore(s => s.nClashes)
  const isCalculating = useInterfaceStore(s => s.isCalculating)
  const lastError     = useInterfaceStore(s => s.lastError)

  const [allChains, setAllChains] = useState<string[]>([])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // On open: enumerate chains + auto-detect binder/target from groups.
  // `open` here reads the pre-flip value intentionally: false = currently closed → opening.
  const handleOpen = useCallback(() => {
    setOpen(prev => !prev)
    if (open) return   // currently open → closing, nothing to do

    setAllChains(getChainsFromPlugin(plugin))

    const { binderChains: curBinder, targetChains: curTarget } = useInterfaceStore.getState()
    if (curBinder.length === 0 && curTarget.length === 0) {
      const detected = detectChainsFromGroups(useFileStore.getState().activeFile)
      if (detected) {
        useInterfaceStore.getState().setChains(detected.binder, detected.target)
      }
    }
  }, [open, plugin])

  // ── Single-structure calculation ───────────────────────────────────────────
  const handleCalculate = useCallback(async () => {
    const store = useInterfaceStore.getState()
    if (store.binderChains.length === 0 || store.targetChains.length === 0) {
      store.setError('Set at least one binder and one target chain.')
      return
    }
    store.setCalculating(true)
    try {
      const binderAtoms = extractAtomsFromPlugin(plugin, store.binderChains, store.atomScope)
      const targetAtoms = extractAtomsFromPlugin(plugin, store.targetChains, store.atomScope)
      if (binderAtoms.length === 0 || targetAtoms.length === 0) {
        store.setError('No atoms found for the specified chains.')
        return
      }
      const { paratope, epitope, nHBonds, nClashes, paratopeProps, epitopeProps } = computeContacts(binderAtoms, targetAtoms, store.cutoff)
      store.setResults(paratope, epitope, nHBonds, nClashes, paratopeProps, epitopeProps)
      useUIStore.getState().setActiveTab('selection')
      // Apply interface colour theme using the shared helper from MolstarViewer
      await applyToAllRepresentations(plugin, (old: any) => ({  // eslint-disable-line @typescript-eslint/no-explicit-any
        ...old,
        colorTheme: { name: INTERFACE_THEME_ID, params: {} },
      }))
    } catch (err) {
      store.setError(err instanceof Error ? err.message : 'Calculation failed')
    } finally {
      useInterfaceStore.getState().setCalculating(false)
    }
  }, [plugin])

  // ── Batch calculation — reads files in parallel batches ────────────────────
  const handleBatch = useCallback(async () => {
    const store = useInterfaceStore.getState()
    if (store.binderChains.length === 0 || store.targetChains.length === 0) {
      store.setError('Set at least one binder and one target chain.')
      return
    }
    const files = useFileStore.getState().files
    if (files.length === 0) { store.setError('No files loaded.'); return }

    const worker = workerRef.current
    if (!worker) { store.setError('Contact worker not ready.'); return }

    setBatchProgress({ done: 0, total: files.length })
    store.setCalculating(true)

    const batchResults: Array<{ filePath: string; name: string; metrics: Record<string, number> }> = []
    const interfaceData: Record<string, { paratope: string[]; epitope: string[]; nHBonds: number; nClashes: number; paratopeProps: import('@/lib/residue-props').ResidueProps; epitopeProps: import('@/lib/residue-props').ResidueProps }> = {}

    try {
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE)
        // Read all files in the batch concurrently on the main thread
        const texts = await Promise.all(
          batch.map(f => readFileContent(f.path).catch(() => null))
        )
        const { binderChains, targetChains, atomScope, cutoff } = useInterfaceStore.getState()

        // Offload contact computation to the worker thread
        const input: WorkerBatchInput = {
          files: batch.map((f, j) => ({
            path: f.path,
            name: getFileStem(f.name),
            text: texts[j] ?? '',
          })),
          binderChains, targetChains, atomScope, cutoff,
        }
        const workerResults = await new Promise<WorkerFileResult[]>((resolve, reject) => {
          const onMsg = (e: MessageEvent<WorkerFileResult[]>) => {
            worker.removeEventListener('message', onMsg)
            worker.removeEventListener('error', onErr)
            resolve(e.data)
          }
          const onErr = (e: ErrorEvent) => {
            worker.removeEventListener('message', onMsg)
            worker.removeEventListener('error', onErr)
            reject(new Error(e.message))
          }
          worker.addEventListener('message', onMsg)
          worker.addEventListener('error', onErr)
          worker.postMessage(input)
        })

        for (const r of workerResults) {
          batchResults.push({
            filePath: r.filePath,
            name:     r.name,
            metrics:  {
              n_paratope:              r.nParatope,
              n_epitope:               r.nEpitope,
              n_contacts:              r.nContacts,
              n_hbonds:                r.nHBonds,
              n_clashes:               r.nClashes,
              paratope_charge:         r.paratopeProps.charge,
              paratope_hydrophobicity: r.paratopeProps.hydrophobicity,
              paratope_aromatic:       r.paratopeProps.aromatic,
              paratope_polar:          r.paratopeProps.polar,
              paratope_nonpolar:       r.paratopeProps.nonpolar,
              epitope_charge:          r.epitopeProps.charge,
              epitope_hydrophobicity:  r.epitopeProps.hydrophobicity,
              epitope_aromatic:        r.epitopeProps.aromatic,
              epitope_polar:           r.epitopeProps.polar,
              epitope_nonpolar:        r.epitopeProps.nonpolar,
            },
          })
          interfaceData[r.filePath] = {
            paratope: r.paratope, epitope: r.epitope,
            nHBonds: r.nHBonds, nClashes: r.nClashes,
            paratopeProps: r.paratopeProps, epitopeProps: r.epitopeProps,
          }
        }

        setBatchProgress({ done: Math.min(i + BATCH_SIZE, files.length), total: files.length })
        // Yield to let the progress bar re-render
        await new Promise(r => setTimeout(r, 0))
      }

      // Single upsert — creates rows for files not yet in the metrics table,
      // or merges columns into existing rows matched by filePath then name.
      useMetricsStore.getState().batchInjectResults(batchResults)
      useBatchInterfaceStore.getState().setBatchResults(interfaceData)

      // Hydrate the single-file store for whichever file is currently open
      const activeFile = useFileStore.getState().activeFile
      const active = activeFile ? interfaceData[activeFile] : null
      if (active) {
        useInterfaceStore.getState().setResults(
          new Set(active.paratope), new Set(active.epitope),
          active.nHBonds, active.nClashes,
          active.paratopeProps, active.epitopeProps,
        )
      }
    } catch (err) {
      store.setError(err instanceof Error ? err.message : 'Batch failed')
    } finally {
      useInterfaceStore.getState().setCalculating(false)
      setBatchProgress(null)
    }
  }, [])

  const hasResults = paratope.size > 0 || epitope.size > 0

  return (
    <div ref={panelRef} style={{ position: 'relative', flexShrink: 0 }}>

      {/* Trigger button */}
      <button
        onClick={handleOpen}
        title="Interface detection — find epitope & paratope residues"
        style={{
          display: 'flex', alignItems: 'center', gap: 5, height: 38, padding: '0 10px',
          border: 'none',
          borderLeft: '1px solid var(--color-border)',
          borderBottom: '1px solid var(--color-border)',
          background: hasResults
            ? `color-mix(in srgb, ${PARATOPE_COLOR} 10%, transparent)`
            : 'var(--color-secondary-bg)',
          color: hasResults ? PARATOPE_COLOR : 'var(--color-text-secondary)',
          cursor: 'pointer', fontSize: 10, fontFamily: 'Outfit, sans-serif',
        }}
      >
        <IconInterface />
        Interface
        {hasResults && (
          <span style={{
            background: PARATOPE_COLOR, color: '#040812', borderRadius: 8,
            padding: '0 4px', fontSize: 9, fontWeight: 700, lineHeight: '14px',
          }}>
            {paratope.size + epitope.size}
          </span>
        )}
      </button>

      {/* Popover panel */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 2px)', right: 0, zIndex: 200,
          background: 'var(--color-secondary-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          width: 300, padding: 14,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>

          {/* Header */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconInterface size={12} />
            Interface Detection
          </div>

          {/* Chain selectors */}
          <ChainSelector
            label="Binder chain(s)"
            selected={binderChains}
            allChains={allChains}
            onChange={binder => useInterfaceStore.getState().setChains(binder, useInterfaceStore.getState().targetChains)}
          />
          <ChainSelector
            label="Target chain(s)"
            selected={targetChains}
            allChains={allChains}
            onChange={target => useInterfaceStore.getState().setChains(useInterfaceStore.getState().binderChains, target)}
          />

          {/* Distance cutoff */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontWeight: 600 }}>Distance cutoff</span>
              <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'var(--color-text-primary)' }}>
                {cutoff.toFixed(1)} Å
              </span>
            </div>
            <input
              type="range" min={2} max={12} step={0.5} value={cutoff}
              onChange={e => useInterfaceStore.getState().setCutoff(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--color-accent)' }}
            />
          </div>

          {/* Atom scope */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontWeight: 600 }}>Atom scope</span>
            {(['all-heavy', 'backbone'] as const).map(scope => (
              <label key={scope} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio" name="atomScope" value={scope}
                  checked={atomScope === scope}
                  onChange={() => useInterfaceStore.getState().setAtomScope(scope)}
                  style={{ accentColor: 'var(--color-accent)' }}
                />
                <span style={{ fontSize: 10, color: 'var(--color-text-primary)' }}>
                  {scope === 'all-heavy' ? 'Any heavy atom (sidechain-aware)' : 'Backbone only (N, Cα, C, O)'}
                </span>
              </label>
            ))}
          </div>

          {/* Error */}
          {lastError && (
            <div style={{ fontSize: 10, color: EPITOPE_COLOR, padding: '4px 8px', borderRadius: 4, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)' }}>
              {lastError}
            </div>
          )}

          {/* Results summary */}
          {hasResults && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(56,189,248,0.12)', color: PARATOPE_COLOR, border: `1px solid ${PARATOPE_COLOR}40` }}>
                Paratope: {paratope.size} res
              </span>
              <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(248,113,113,0.12)', color: EPITOPE_COLOR, border: `1px solid ${EPITOPE_COLOR}40` }}>
                Epitope: {epitope.size} res
              </span>
              <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'var(--color-secondary-bg)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                H-bonds: {nHBonds}
              </span>
              <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: nClashes > 0 ? 'rgba(251,191,36,0.12)' : 'var(--color-secondary-bg)', color: nClashes > 0 ? '#f59e0b' : 'var(--color-text-disabled)', border: `1px solid ${nClashes > 0 ? '#f59e0b40' : 'var(--color-border)'}` }}>
                Clashes: {nClashes}
              </span>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button onClick={handleCalculate} disabled={isCalculating} style={isCalculating ? disabledBtn : calcBtn}>
              {isCalculating && !batchProgress ? '⏳ Calculating…' : '⚡ Calculate — this structure'}
            </button>
            <button onClick={handleBatch} disabled={isCalculating} style={isCalculating ? disabledBtn : secondaryBtn}>
              {batchProgress
                ? `⏳ ${batchProgress.done} / ${batchProgress.total} files…`
                : '📊 Batch all files → Metrics'
              }
            </button>
          </div>

          {/* Reset */}
          {hasResults && (
            <button
              onClick={() => useInterfaceStore.getState().clear()}
              style={{ fontSize: 10, background: 'none', border: 'none', color: 'var(--color-text-disabled)', cursor: 'pointer', textAlign: 'left', padding: 0 }}
            >
              Clear interface results
            </button>
          )}
        </div>
      )}
    </div>
  )
}
