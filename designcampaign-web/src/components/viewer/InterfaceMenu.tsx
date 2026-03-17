import { useRef, useEffect, useState, useCallback } from 'react'
import { useInterfaceStore } from '@/stores/interface-store'
import { useGroupStore } from '@/stores/group-store'
import { useFileStore } from '@/stores/file-store'
import { useMetricsStore } from '@/stores/metrics-store'
import { extractAtomsFromPlugin, computeContacts } from '@/lib/interface-calc'
import { parseAtoms } from '@/lib/parsers/parse-atoms'
import { readFileContent } from '@/lib/fsa'
import { INTERFACE_THEME_ID } from './themes/interface-theme'

type PluginUIContext = import('molstar/lib/mol-plugin-ui/context').PluginUIContext

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
      {/* Two circles (binder / target) connected by dots */}
      <circle cx="3.5" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="10.5" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="6" y1="7" x2="8" y2="7" stroke="currentColor" strokeWidth="1.2" strokeDasharray="1.5 0.8" />
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function InterfaceMenu({ plugin }: { plugin: PluginUIContext }) {
  const [open, setOpen]       = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Store — data only (individual selectors to avoid snapshot instability)
  const binderChains  = useInterfaceStore(s => s.binderChains)
  const targetChains  = useInterfaceStore(s => s.targetChains)
  const cutoff        = useInterfaceStore(s => s.cutoff)
  const atomScope     = useInterfaceStore(s => s.atomScope)
  const paratope      = useInterfaceStore(s => s.paratope)
  const epitope       = useInterfaceStore(s => s.epitope)
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

  // On open: enumerate chains + auto-detect binder/target from groups
  const handleOpen = useCallback(() => {
    setOpen(prev => !prev)
    if (open) return   // closing

    const chains = getChainsFromPlugin(plugin)
    setAllChains(chains)

    const { binderChains: curBinder, targetChains: curTarget } = useInterfaceStore.getState()
    // Only auto-detect if chains are currently empty
    if (curBinder.length === 0 && curTarget.length === 0) {
      const detected = detectChainsFromGroups(useFileStore.getState().activeFile)
      if (detected) {
        useInterfaceStore.getState().setChains(detected.binder, detected.target)
      }
    }
  }, [open, plugin])

  // ── Apply interface color theme to viewer ──────────────────────────────────
  const applyInterfaceTheme = useCallback(async () => {
    try {
      const structures = (plugin as any).managers.structure.hierarchy.current.structures
      if (structures.length === 0) return
      const update = (plugin as any).state.data.build()
      for (const structureRef of structures) {
        for (const component of structureRef.components) {
          for (const repr of component.representations ?? []) {
            update.to(repr.cell).update((old: any) => ({
              ...old,
              colorTheme: { name: INTERFACE_THEME_ID, params: {} },
            }))
          }
        }
      }
      await (plugin as any).runTask((plugin as any).state.data.updateTree(update))
    } catch { /* best effort */ }
  }, [plugin])

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
      const { paratope, epitope } = computeContacts(binderAtoms, targetAtoms, store.cutoff)
      store.setResults(paratope, epitope)
      await applyInterfaceTheme()
    } catch (err) {
      store.setError(err instanceof Error ? err.message : 'Calculation failed')
    } finally {
      useInterfaceStore.getState().setCalculating(false)
    }
  }, [plugin, applyInterfaceTheme])

  // ── Batch calculation ──────────────────────────────────────────────────────
  const handleBatch = useCallback(async () => {
    const store = useInterfaceStore.getState()
    if (store.binderChains.length === 0 || store.targetChains.length === 0) {
      store.setError('Set at least one binder and one target chain.')
      return
    }
    const files = useFileStore.getState().files
    if (files.length === 0) {
      store.setError('No files loaded.')
      return
    }

    setBatchProgress({ done: 0, total: files.length })
    store.setCalculating(true)

    const nParatopeMap = new Map<string, number>()
    const nEpitopeMap  = new Map<string, number>()
    const nContactsMap = new Map<string, number>()

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        try {
          const pdbText     = await readFileContent(file.path)
          const binderAtoms = parseAtoms(pdbText, store.binderChains, store.atomScope)
          const targetAtoms = parseAtoms(pdbText, store.targetChains, store.atomScope)
          const result      = computeContacts(binderAtoms, targetAtoms, store.cutoff)
          const name        = file.path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? file.path
          nParatopeMap.set(name, result.paratope.size)
          nEpitopeMap.set(name, result.epitope.size)
          nContactsMap.set(name, result.nContacts)
        } catch { /* skip unreadable files */ }
        setBatchProgress({ done: i + 1, total: files.length })
        // Yield to UI thread every 10 files
        if (i % 10 === 9) await new Promise(r => setTimeout(r, 0))
      }

      const { injectColumn } = useMetricsStore.getState()
      injectColumn('n_paratope', nParatopeMap)
      injectColumn('n_epitope',  nEpitopeMap)
      injectColumn('n_contacts', nContactsMap)
    } catch (err) {
      store.setError(err instanceof Error ? err.message : 'Batch failed')
    } finally {
      useInterfaceStore.getState().setCalculating(false)
      setBatchProgress(null)
    }
  }, [])

  const hasResults = paratope.size > 0 || epitope.size > 0

  // ── Button styles ──────────────────────────────────────────────────────────
  const calcBtn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 5, padding: '5px 10px', borderRadius: 5, fontSize: 10,
    border: '1px solid var(--color-border)',
    background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
    color: 'var(--color-accent)', cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
    fontWeight: 600,
  }
  const disabledBtn: React.CSSProperties = { ...calcBtn, opacity: 0.5, cursor: 'not-allowed' }

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
            ? 'color-mix(in srgb, #38bdf8 10%, transparent)'
            : 'var(--color-secondary-bg)',
          color: hasResults ? '#38bdf8' : 'var(--color-text-secondary)',
          cursor: 'pointer', fontSize: 10, fontFamily: 'Outfit, sans-serif',
        }}
      >
        <IconInterface />
        Interface
        {hasResults && (
          <span style={{
            background: '#38bdf8', color: '#040812', borderRadius: 8,
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
          width: 300,
          padding: 14,
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
              type="range"
              min={2} max={12} step={0.5}
              value={cutoff}
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
                  type="radio"
                  name="atomScope"
                  value={scope}
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
            <div style={{ fontSize: 10, color: '#f87171', padding: '4px 8px', borderRadius: 4, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)' }}>
              {lastError}
            </div>
          )}

          {/* Results summary */}
          {hasResults && (
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'rgba(56,189,248,0.12)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.25)' }}>
                Paratope: {paratope.size} res
              </span>
              <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)' }}>
                Epitope: {epitope.size} res
              </span>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              onClick={handleCalculate}
              disabled={isCalculating}
              style={isCalculating ? disabledBtn : calcBtn}
            >
              {isCalculating && !batchProgress ? '⏳ Calculating…' : '⚡ Calculate — this structure'}
            </button>

            <button
              onClick={handleBatch}
              disabled={isCalculating}
              style={isCalculating ? disabledBtn : { ...calcBtn, background: 'transparent', color: 'var(--color-text-secondary)' }}
            >
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
