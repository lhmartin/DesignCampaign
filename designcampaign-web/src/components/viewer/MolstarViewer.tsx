import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react'
import { useMolstar } from './hooks/useMolstar'
import { ViewerControls, type RepresentationStyle, type ColorScheme } from './ViewerControls'
import { SequenceViewer } from './SequenceViewer'
import { InterfaceMenu } from './InterfaceMenu'
import { useSelectionStore } from '@/stores/selection-store'
import { useComparisonStore } from '@/stores/comparison-store'
import { useInterfaceStore } from '@/stores/interface-store'
import { readFileContent } from '@/lib/fsa'
import { useFileStore } from '@/stores/file-store'
import { type ChainSequence, THREE_TO_ONE } from '@/lib/sequence'
import { getFileFormat } from '@/lib/utils'
import { syncToMolstar } from '@/lib/mol-selection-sync'
import { extractCAPositions, applyStructureTransform } from '@/lib/mol-alignment'
import { useAntpackStore } from '@/stores/antpack-store'

type PluginUIContext = import('molstar/lib/mol-plugin-ui/context').PluginUIContext

const STYLE_MAP: Record<RepresentationStyle, string> = {
  cartoon: 'cartoon',
  'ball-and-stick': 'ball-and-stick',
  spacefill: 'spacefill',
  line: 'line',
  'gaussian-surface': 'gaussian-surface',
}

export interface MolstarViewerHandle {
  loadFromFile: (filePath: string) => Promise<void>
  loadAsComparison: (filePath: string) => Promise<void>
  getPlugin: () => PluginUIContext | null
}

interface MolstarViewerProps {
  onStructureLoaded?: (filePath: string) => void
  onError?: (error: string) => void
  onNeedPythonSetup?: () => void
}

// ─── Comparison overlay icon ──────────────────────────────────────────────────

function IconLayers({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <rect x="1" y="4" width="8" height="7" rx="1" stroke="currentColor" strokeWidth="1.2"/>
      <rect x="5" y="2" width="8" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2.5 1.5"/>
      <line x1="1" y1="4" x2="5" y2="2" stroke="currentColor" strokeWidth="1.1"/>
      <line x1="9" y1="4" x2="13" y2="2" stroke="currentColor" strokeWidth="1.1"/>
    </svg>
  )
}

// ─── CDR label button (toolbar) ───────────────────────────────────────────────

function CdrButton({ chains, activeFile, onNeedSetup }: {
  chains: ChainSequence[]
  activeFile: string | null
  onNeedSetup?: () => void
}) {
  const annotate      = useAntpackStore(s => s.annotate)
  const cdrRunning    = useAntpackStore(s => !!activeFile && s.running.has(activeFile))
  const cdrError      = useAntpackStore(s => activeFile ? s.errors.get(activeFile) : undefined)
  const hasAnnotation = useAntpackStore(s => !!activeFile && s.annotations.has(activeFile))
  const [envReady, setEnvReady] = useState<boolean | null>(null)

  const checkEnv = () => {
    window.electronAPI?.pythonSetupStatus()
      .then(({ ready }) => setEnvReady(ready))
      .catch(() => setEnvReady(false))
  }

  useEffect(() => {
    checkEnv()
    return window.electronAPI?.onPythonSetupComplete(() => setEnvReady(true))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!activeFile || chains.length === 0) return null

  // Env status not yet known — don't render anything to avoid flicker
  if (envReady === null) return null

  if (!envReady) {
    return (
      <button
        onClick={onNeedSetup}
        title="Python environment not set up — click to install"
        style={{
          alignSelf: 'center',
          margin: '0 2px',
          padding: '2px 8px',
          borderRadius: 4,
          fontSize: 9,
          fontFamily: 'Outfit, sans-serif',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          flexShrink: 0,
          cursor: 'pointer',
          border: '1px solid rgba(251,191,36,0.5)',
          background: 'rgba(251,191,36,0.08)',
          color: 'rgba(251,191,36,0.9)',
        }}
      >
        ⚙ Set up Python
      </button>
    )
  }

  return (
    <button
      onClick={() => void annotate(activeFile, chains)}
      disabled={cdrRunning}
      title={cdrError ?? (hasAnnotation
        ? 'Re-run AntPack CDR annotation (IMGT)'
        : 'Label CDR/FW regions using AntPack (IMGT scheme)')}
      style={{
        alignSelf: 'center',
        margin: '0 2px',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 9,
        fontFamily: 'Outfit, sans-serif',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        cursor: cdrRunning ? 'wait' : 'pointer',
        border: `1px solid ${
          cdrError      ? 'rgba(239,68,68,0.5)'
          : hasAnnotation ? 'color-mix(in srgb, var(--color-accent) 40%, transparent)'
          : 'var(--color-border)'
        }`,
        background: cdrError
          ? 'rgba(239,68,68,0.10)'
          : hasAnnotation
            ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)'
            : 'transparent',
        color: cdrError
          ? 'rgba(239,68,68,0.9)'
          : hasAnnotation
            ? 'var(--color-accent)'
            : 'var(--color-text-secondary)',
      }}
    >
      {cdrRunning ? 'Labelling…' : cdrError ? '⚠ CDR error' : 'Label CDR regions'}
    </button>
  )
}

// ─── Inline CompareMenu (no circular imports — uses plugin prop directly) ─────

function CompareMenu({ plugin }: { plugin: PluginUIContext }) {
  const { entries, updateEntry, removeEntry } = useComparisonStore()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const alignEntry = async (id: string) => {
    const state = useComparisonStore.getState()
    const entry = state.entries.find(e => e.id === id)
    if (!entry) return
    setBusy(true)
    try {
      const { MinimizeRmsd } = await import('molstar/lib/mol-math/linear-algebra/3d/minimize-rmsd') as any
      const structures = plugin.managers.structure.hierarchy.current.structures
      if (structures.length < 2) return
      const entryIdx = state.entries.indexOf(entry)
      const mobileIdx = Math.min(entryIdx + 1, structures.length - 1)
      const fixed  = (structures[0].cell.obj as any)?.data
      const mobile = (structures[mobileIdx].cell.obj as any)?.data
      if (!fixed || !mobile) return
      const posA = extractCAPositions(fixed)
      const posB = extractCAPositions(mobile)
      const len = Math.min(posA.x.length, posB.x.length)
      if (len === 0) return
      const aPos = { x: posA.x.slice(0, len), y: posA.y.slice(0, len), z: posA.z.slice(0, len) }
      const bPos = { x: posB.x.slice(0, len), y: posB.y.slice(0, len), z: posB.z.slice(0, len) }
      const result = MinimizeRmsd.compute({ a: aPos, b: bPos })
      const xformRef = await applyStructureTransform(
        plugin,
        structures[mobileIdx].cell.transform.ref,
        Array.from(result.bTransform) as number[],
        entry.dataRef,
      )
      updateEntry(id, { rmsd: result.rmsd as number, dataRef: xformRef })
    } catch { /* best effort */ }
    finally { setBusy(false) }
  }

  const toggleVisible = (id: string) => {
    const state = useComparisonStore.getState()
    const entry = state.entries.find(e => e.id === id)
    if (!entry) return
    const entryIdx = state.entries.indexOf(entry)
    const structures = plugin.managers.structure.hierarchy.current.structures
    const mobileIdx = Math.min(entryIdx + 1, structures.length - 1)
    if (mobileIdx <= 0 || mobileIdx >= structures.length) return
    for (const comp of structures[mobileIdx].components) {
      for (const repr of comp.representations ?? []) {
        plugin.state.data.updateCellState(repr.cell.transform.ref, { isHidden: entry.visible })
      }
    }
    updateEntry(id, { visible: !entry.visible })
  }

  const removeComparison = async (id: string) => {
    const state = useComparisonStore.getState()
    const entry = state.entries.find(e => e.id === id)
    if (!entry) return
    try {
      const entryIdx = state.entries.indexOf(entry)
      const structures = plugin.managers.structure.hierarchy.current.structures
      const mobileIdx = Math.min(entryIdx + 1, structures.length - 1)
      if (mobileIdx > 0 && mobileIdx < structures.length) {
        await plugin.managers.structure.hierarchy.remove([structures[mobileIdx]])
      }
    } catch { /* ignore */ }
    removeEntry(id)
  }

  const smallBtn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '2px 6px', borderRadius: 4, fontSize: 9,
    border: '1px solid var(--color-border)', background: 'transparent',
    color: 'var(--color-text-secondary)', cursor: 'pointer',
    flexShrink: 0,
  }

  return (
    <div ref={panelRef} style={{ position: 'relative', flexShrink: 0 }}>

      {/* Trigger button — lives in the toolbar row */}
      <button
        onClick={() => setOpen(p => !p)}
        title="Overlay structures for comparison"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          height: 38,
          padding: '0 10px',
          border: 'none',
          borderLeft: '1px solid var(--color-border)',
          borderBottom: '1px solid var(--color-border)',
          background: entries.length > 0
            ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)'
            : 'var(--color-secondary-bg)',
          color: entries.length > 0 ? 'var(--color-accent)' : 'var(--color-text-secondary)',
          cursor: 'pointer',
          fontSize: 10,
          fontFamily: 'Outfit, sans-serif',
        }}
      >
        <IconLayers />
        {entries.length > 0 && (
          <span style={{
            background: 'var(--color-accent)',
            color: 'var(--color-secondary-bg)',
            borderRadius: 8,
            padding: '0 4px',
            fontSize: 9,
            fontWeight: 700,
            lineHeight: '14px',
          }}>
            {entries.length}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 2px)',
          right: 0,
          zIndex: 200,
          background: 'var(--color-secondary-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          width: 290,
          maxHeight: 380,
          overflow: 'auto',
        }}>

          {entries.length === 0 ? (
            /* Empty hint */
            <div style={{
              padding: '20px 16px',
              textAlign: 'center',
              color: 'var(--color-text-disabled)',
              lineHeight: 1.7,
            }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>🔬</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                Overlay structures
              </div>
              <div style={{ fontSize: 10 }}>
                <kbd style={{
                  padding: '1px 5px',
                  borderRadius: 3,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-background)',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 9,
                }}>Ctrl</kbd>
                {' '}+ click any file to add an overlay, then{' '}
                <strong style={{ color: 'var(--color-text-primary)' }}>Align</strong>
                {' '}to superimpose by Cα atoms.
              </div>
            </div>
          ) : (
            /* Entry list */
            <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {entries.map(entry => (
                <div
                  key={entry.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 8px',
                    borderRadius: 6,
                    background: 'var(--color-background)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  {/* Color swatch */}
                  <span style={{
                    width: 10, height: 10, borderRadius: 2, flexShrink: 0,
                    background: `#${entry.color.toString(16).padStart(6, '0')}`,
                    border: '1px solid rgba(0,0,0,0.15)',
                  }} />

                  {/* Name */}
                  <span style={{
                    flex: 1, fontSize: 10,
                    fontFamily: 'JetBrains Mono, monospace',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: 'var(--color-text-primary)',
                  }}>
                    {entry.name}
                  </span>

                  {/* RMSD badge */}
                  {entry.rmsd !== null ? (
                    <span style={{
                      fontSize: 9, fontFamily: 'JetBrains Mono, monospace', flexShrink: 0,
                      background: 'color-mix(in srgb, var(--color-accent) 15%, transparent)',
                      color: 'var(--color-accent)',
                      padding: '1px 5px', borderRadius: 8,
                    }}>
                      {entry.rmsd.toFixed(2)} Å
                    </span>
                  ) : (
                    <span style={{ fontSize: 9, color: 'var(--color-text-disabled)', flexShrink: 0 }}>—</span>
                  )}

                  {/* Align */}
                  <button
                    onClick={() => alignEntry(entry.id)}
                    disabled={busy}
                    title="Superimpose Cα atoms and compute RMSD"
                    style={smallBtn}
                  >
                    Align
                  </button>

                  {/* Visibility */}
                  <button
                    onClick={() => toggleVisible(entry.id)}
                    disabled={busy}
                    title={entry.visible ? 'Hide' : 'Show'}
                    style={{ ...smallBtn, padding: '2px 5px' }}
                  >
                    {entry.visible ? '👁' : '◌'}
                  </button>

                  {/* Remove */}
                  <button
                    onClick={() => removeComparison(entry.id)}
                    disabled={busy}
                    title="Remove overlay"
                    style={{ ...smallBtn, padding: '2px 5px', color: 'var(--color-text-disabled)' }}
                  >
                    ✕
                  </button>
                </div>
              ))}

              {/* Footer hint */}
              <div style={{
                fontSize: 9, color: 'var(--color-text-disabled)',
                padding: '4px 4px 0',
                lineHeight: 1.5,
              }}>
                <kbd style={{
                  padding: '0 3px', borderRadius: 2,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-background)',
                  fontFamily: 'JetBrains Mono, monospace',
                }}>Ctrl</kbd>
                {' '}+ click more files in the sidebar to add overlays.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export const MolstarViewer = forwardRef<MolstarViewerHandle, MolstarViewerProps>(
  function MolstarViewer({ onStructureLoaded, onError, onNeedPythonSetup }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const { plugin, isLoading, error, setIsLoading } = useMolstar(containerRef)
    const [style, setStyle] = useState<RepresentationStyle>('cartoon')
    const [colorScheme, setColorScheme] = useState<ColorScheme>('sequence-id')
    const [cameraMode, setCameraMode] = useState<'perspective' | 'orthographic'>('perspective')
    const [viewerBg, setViewerBg] = useState<'dark' | 'light'>('dark')
    const [spinning, setSpinning] = useState(false)
    const [spinSpeed, setSpinSpeed] = useState(0.2) // 1 rotation every 5s
    const [showAO, setShowAO] = useState(false)
    const [seqData, setSeqData] = useState<{ seq: ChainSequence[]; values: Map<string, number> }>(
      { seq: [], values: new Map() }
    )
    const activeFile = useFileStore(s => s.activeFile)
    const { toggleResidue, addResidue, clearSelection, selectedResidues } = useSelectionStore()

    // Sync selection store → 3D viewer so external selectAll() calls (InterfaceGroup, etc.) highlight in Mol*.
    // SequenceViewer handles its own click-driven sync; this handles all other sources.
    useEffect(() => {
      if (!plugin) return
      syncToMolstar(plugin, Array.from(selectedResidues))
    }, [plugin, selectedResidues])

    // Subscribe to Mol* state changes to extract sequence automatically.
    // Debounced: applyPreset fires many intermediate state events — wait for them to settle.
    useEffect(() => {
      if (!plugin) return
      let timer: ReturnType<typeof setTimeout>
      const sub = plugin.state.data.events.changed.subscribe(() => {
        clearTimeout(timer)
        timer = setTimeout(() => {
          const { seq, values } = extractSequenceFromPlugin(plugin)
          setSeqData(prev => seq.length === 0 && prev.seq.length === 0 ? prev : { seq, values })
        }, 250)
      })
      return () => { sub.unsubscribe(); clearTimeout(timer) }
    }, [plugin])

    useImperativeHandle(ref, () => ({
      loadFromFile: async (filePath: string) => {
        if (!plugin) { onError?.('Mol* viewer not initialized'); return }
        useComparisonStore.getState().clearAll()
        useInterfaceStore.getState().clear()
        await loadStructureFromFile(plugin, filePath, setIsLoading, onStructureLoaded, onError)
        setStyle('cartoon')
        setColorScheme('sequence-id')
        clearSelection()
      },
      loadAsComparison: async (filePath: string) => {
        if (!plugin) { onError?.('Mol* viewer not initialized'); return }
        await loadComparisonFromFile(plugin, filePath, onError)
      },
      getPlugin: () => plugin,
    }), [plugin, onStructureLoaded, onError, setIsLoading, clearSelection])

    useEffect(() => {
      if (!plugin) return
      applyStyle(plugin, style).catch(console.error)
    }, [plugin, style])

    useEffect(() => {
      if (!plugin) return
      applyColorScheme(plugin, colorScheme).catch(console.error)
    }, [plugin, colorScheme])

    useEffect(() => {
      if (!plugin?.canvas3d) return
      try { (plugin.canvas3d as any).setProps({ camera: { mode: cameraMode } }) } catch { /* best effort */ }
    }, [plugin, cameraMode])

    useEffect(() => {
      if (!plugin?.canvas3d) return
      const bg = viewerBg === 'dark' ? 0x040812 : 0xffffff
      try { (plugin.canvas3d as any).setProps({ renderer: { backgroundColor: bg } }) } catch { /* best effort */ }
    }, [plugin, viewerBg])

    useEffect(() => {
      if (!plugin?.canvas3d) return
      try {
        (plugin.canvas3d as any).setProps({
          trackball: {
            animate: spinning
              ? { name: 'spin', params: { speed: spinSpeed, axis: [0, -1, 0] } }
              : { name: 'off', params: {} },
          },
        })
      } catch { /* best effort */ }
    }, [plugin, spinning, spinSpeed])

    useEffect(() => {
      if (!plugin?.canvas3d) return
      try {
        (plugin.canvas3d as any).setProps({
          postprocessing: {
            occlusion: showAO
              ? { name: 'on', params: { bias: 0.8, blurKernelSize: 15, radius: 5, samples: 32, resolutionScale: 1 } }
              : { name: 'off', params: {} },
          },
        })
      } catch { /* best effort */ }
    }, [plugin, showAO])

    useEffect(() => {
      if (!plugin) return
      const sub = plugin.behaviors.interaction.click.subscribe(async ({ current, modifiers }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { StructureElement, StructureProperties } = await import('molstar/lib/mol-model/structure') as any
        if (!StructureElement.Loci.is(current.loci)) {
          if (!modifiers?.control) clearSelection()
          return
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const loci = current.loci as any
        if (!modifiers?.control) clearSelection()
        const { OrderedSet } = await import('molstar/lib/mol-data/int') as any
        for (const { unit, indices } of loci.elements) {
          const l = StructureElement.Location.create(loci.structure)
          OrderedSet.forEach(indices, (idx: number) => {
            StructureElement.Location.set(l, loci.structure, unit, (unit as any).elements[idx])
            const chainId = StructureProperties.chain.auth_asym_id(l)
            const resId = StructureProperties.residue.auth_seq_id(l)
            if (modifiers?.control) toggleResidue(chainId, resId)
            else addResidue(chainId, resId)
          })
        }
      })
      return () => sub.unsubscribe()
    }, [plugin, addResidue, toggleResidue, clearSelection])

    useEffect(() => {
      if (error) onError?.(error)
    }, [error, onError])

    return (
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>

        {/* ── Toolbar row: ViewerControls + CompareMenu ── */}
        {plugin && (
          <div style={{ display: 'flex', alignItems: 'stretch', flexShrink: 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <ViewerControls
                style={style}
                colorScheme={colorScheme}
                cameraMode={cameraMode}
                viewerBg={viewerBg}
                spinning={spinning}
                spinSpeed={spinSpeed}
                showAO={showAO}
                onStyleChange={setStyle}
                onColorChange={setColorScheme}
                onCameraModeChange={setCameraMode}
                onViewerBgChange={setViewerBg}
                onSpinChange={setSpinning}
                onSpinSpeedChange={setSpinSpeed}
                onAOChange={setShowAO}
                onResetView={() => { try { (plugin as any).managers.camera.reset() } catch { /* best effort */ } }}
              />
            </div>
            <CdrButton chains={seqData.seq} activeFile={activeFile} onNeedSetup={onNeedPythonSetup} />
            <InterfaceMenu plugin={plugin} />
            <CompareMenu plugin={plugin} />
          </div>
        )}

        {/* ── Sequence strip ── */}
        {seqData.seq.length > 0 && (
          <SequenceViewer
            chains={seqData.seq}
            plugin={plugin}
            residueValues={seqData.values}
            structurePath={activeFile ?? undefined}
          />
        )}

        {/* ── 3D canvas ── */}
        <div style={{ flex: 1, position: 'relative', minHeight: 0, background: 'var(--color-viewer-bg)' }}>
          <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

          {isLoading && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.2)', pointerEvents: 'none', zIndex: 20,
            }}>
              <span style={{
                fontSize: 11, color: '#fff',
                background: 'rgba(0,0,0,0.5)', padding: '3px 10px', borderRadius: 4,
              }}>Loading…</span>
            </div>
          )}

          {!plugin && !error && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-disabled)' }}>
                Initializing viewer…
              </span>
            </div>
          )}

          {error && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <span style={{ fontSize: 11, color: '#f87171', textAlign: 'center', padding: '0 16px' }}>
                {error}
              </span>
            </div>
          )}
        </div>
      </div>
    )
  }
)

// ─── Sequence extraction from loaded Mol* plugin ──────────────────────────────

function extractSequenceFromPlugin(plugin: PluginUIContext): { seq: ChainSequence[], values: Map<string, number> } {
  const empty = { seq: [] as ChainSequence[], values: new Map<string, number>() }
  try {
    const structures = plugin.managers.structure.hierarchy.current.structures
    if (structures.length === 0) return empty
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const structure = (structures[0].cell.obj as any)?.data
    if (!structure) return empty

    const chainMap = new Map<string, Map<number, string>>()
    const values = new Map<string, number>()

    for (const unit of structure.units as any[]) {
      if (unit.kind !== 0) continue
      const hierarchy = unit.model?.atomicHierarchy
      const conf      = unit.model?.atomicConformation
      // Verify all required columns exist before touching the loop
      const atomIdCol    = hierarchy?.atoms?.auth_atom_id
      const atomCompCol  = hierarchy?.atoms?.auth_comp_id
      const resSeqCol    = hierarchy?.residues?.auth_seq_id
      const chainAsymCol = hierarchy?.chains?.auth_asym_id
      const resAtomSeg   = hierarchy?.residueAtomSegments
      const chainAtomSeg = hierarchy?.chainAtomSegments
      if (!atomIdCol?.value || !atomCompCol?.value || !resSeqCol?.value
          || !chainAsymCol?.value || !resAtomSeg?.index || !chainAtomSeg?.index) continue

      const elements: ArrayLike<number> = unit.elements
      for (let i = 0; i < elements.length; i++) {
        try {
          const atomIdx    = elements[i]
          if (atomIdCol.value(atomIdx) !== 'CA') continue
          const residueIdx: number = resAtomSeg.index[atomIdx]
          const resName: string  = atomCompCol.value(atomIdx)
          const resNum:  number  = resSeqCol.value(residueIdx)
          const chainIdx: number = chainAtomSeg.index[atomIdx]
          const chainId:  string = chainAsymCol.value(chainIdx)
          if (!chainId) continue
          let chainResidues = chainMap.get(chainId)
          if (!chainResidues) { chainResidues = new Map(); chainMap.set(chainId, chainResidues) }
          if (!chainResidues.has(resNum)) {
            chainResidues.set(resNum, THREE_TO_ONE[resName.toUpperCase()] ?? 'X')
            try {
              const bfCol = conf?.B_iso_or_equiv
              const bFactor = typeof bfCol?.value === 'function'
                ? bfCol.value(atomIdx)
                : (bfCol as unknown as ArrayLike<number>)?.[atomIdx]
              if (typeof bFactor === 'number' && isFinite(bFactor)) {
                values.set(`${chainId}:${resNum}`, bFactor)
              }
            } catch { /* B-factor unavailable */ }
          }
        } catch { /* skip bad atom */ }
      }
    }

    const seq: ChainSequence[] = []
    for (const [chain, resMap] of chainMap) {
      const residues = Array.from(resMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([number, code]) => ({ code, number }))
      if (residues.length > 0) seq.push({ chain, residues })
    }
    return { seq, values }
  } catch {
    return empty
  }
}

// ─── Load helpers ─────────────────────────────────────────────────────────────

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Batch-update all representations in the given structures (or all loaded ones) in a single task. */
export async function applyToAllRepresentations(
  plugin: PluginUIContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateFn: (old: any) => any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  structureRefs?: any[],
): Promise<void> {
  const structures = structureRefs ?? plugin.managers.structure.hierarchy.current.structures
  if (structures.length === 0) return
  const update = plugin.state.data.build()
  for (const structureRef of structures) {
    for (const component of structureRef.components) {
      for (const repr of component.representations ?? []) {
        update.to(repr.cell).update(updateFn)
      }
    }
  }
  try { await plugin.runTask(plugin.state.data.updateTree(update)) } catch { /* best effort */ }
}

/** Load raw PDB/mmCIF content into the plugin, parse, and apply the default preset. */
async function loadStructureData(
  plugin: PluginUIContext,
  filePath: string,
): Promise<void> {
  const contents = await readFileContent(filePath)
  const fileName = filePath.split('/').pop() ?? filePath
  const data = await plugin.builders.data.rawData({ data: contents, label: fileName })
  const trajectory = await plugin.builders.structure.parseTrajectory(data, getFileFormat(filePath))
  await plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default')
}

async function loadStructureFromFile(
  plugin: PluginUIContext,
  filePath: string,
  setIsLoading: (v: boolean) => void,
  onStructureLoaded?: (path: string) => void,
  onError?: (err: string) => void,
): Promise<void> {
  setIsLoading(true)
  try {
    await plugin.clear()
    await loadStructureData(plugin, filePath)
    onStructureLoaded?.(filePath)
  } catch (err) {
    onError?.(err instanceof Error ? err.message : 'Failed to load structure')
  } finally {
    setIsLoading(false)
  }
}

async function loadComparisonFromFile(
  plugin: PluginUIContext,
  filePath: string,
  onError?: (err: string) => void,
): Promise<void> {
  try {
    const { nextColor, addEntry } = useComparisonStore.getState()
    const color = nextColor()

    await loadStructureData(plugin, filePath)

    const structures = plugin.managers.structure.hierarchy.current.structures
    const lastStructure = structures[structures.length - 1]
    if (lastStructure) {
      await applyToAllRepresentations(
        plugin,
        (old: Record<string, unknown>) => ({
          ...old,
          colorTheme: { name: 'uniform', params: { value: color } },
          alpha: 0.6,
        }),
        [lastStructure],
      )
    }

    const fileName = filePath.split('/').pop() ?? filePath
    addEntry({ id: crypto.randomUUID(), name: fileName, filePath, color, visible: true, rmsd: null, dataRef: null })
  } catch (err) {
    onError?.(err instanceof Error ? err.message : 'Failed to load comparison')
  }
}

async function applyStyle(plugin: PluginUIContext, style: RepresentationStyle): Promise<void> {
  const reprType = STYLE_MAP[style]
  await applyToAllRepresentations(plugin, (old: any) => ({ ...old, type: { name: reprType, params: {} } })) // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function applyColorScheme(plugin: PluginUIContext, scheme: ColorScheme): Promise<void> {
  await applyToAllRepresentations(plugin, (old: Record<string, unknown>) => ({ ...old, colorTheme: { name: scheme, params: {} } }))
}
