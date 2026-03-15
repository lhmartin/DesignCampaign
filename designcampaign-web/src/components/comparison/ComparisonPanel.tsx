import { useState, useCallback } from 'react'
import type { RefObject } from 'react'
import type { MolstarViewerHandle } from '@/components/viewer/MolstarViewer'
import { useComparisonStore } from '@/stores/comparison-store'

interface ComparisonPanelProps {
  viewerRef: RefObject<MolstarViewerHandle | null>
}

export function ComparisonPanel({ viewerRef }: ComparisonPanelProps) {
  const { entries, removeEntry, updateEntry, clearAll } = useComparisonStore()
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // ── align a comparison structure to the main (index 0) ───────────────────

  const alignEntry = useCallback(async (id: string) => {
    const plugin = viewerRef.current?.getPlugin()
    if (!plugin) return
    const entry = useComparisonStore.getState().entries.find((e) => e.id === id)
    if (!entry) return

    setBusy(true)
    setStatus('Aligning…')
    try {
      const { MinimizeRmsd } = await import('molstar/lib/mol-math/linear-algebra/3d/minimize-rmsd') as any
      const structures = plugin.managers.structure.hierarchy.current.structures
      if (structures.length < 2) throw new Error('Need at least 2 structures loaded')

      const fixedStructure = structures[0].cell.obj?.data as any
      const entryIdx = useComparisonStore.getState().entries.indexOf(entry)
      const mobileIdx = Math.min(entryIdx + 1, structures.length - 1)
      const mobileStructure = structures[mobileIdx].cell.obj?.data as any

      if (!fixedStructure || !mobileStructure) throw new Error('Structure data not available')

      const posA = extractCAPositions(fixedStructure)
      const posB = extractCAPositions(mobileStructure)

      if (posA.x.length === 0 || posB.x.length === 0) throw new Error('No CA atoms found')

      const len = Math.min(posA.x.length, posB.x.length)
      const aPos = { x: posA.x.slice(0, len), y: posA.y.slice(0, len), z: posA.z.slice(0, len) }
      const bPos = { x: posB.x.slice(0, len), y: posB.y.slice(0, len), z: posB.z.slice(0, len) }

      const result = MinimizeRmsd.compute(aPos, bPos)

      const { StateTransforms } = await import('molstar/lib/mol-plugin-state/transforms') as any
      const mobileCell = structures[mobileIdx].cell
      const update = plugin.state.data.build()
        .to(mobileCell.transform.ref)
        .update(StateTransforms.Model.TransformStructureConformation, (p: any) => ({
          ...p,
          transform: {
            name: 'matrix',
            params: { data: Array.from(result.bTransform), transpose: false },
          },
        }))
      await plugin.runTask(plugin.state.data.updateTree(update))

      updateEntry(id, { rmsd: result.rmsd as number })
      setStatus(null)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Alignment failed')
    } finally {
      setBusy(false)
    }
  }, [viewerRef, updateEntry])

  // ── toggle visibility ─────────────────────────────────────────────────────

  const toggleVisible = useCallback(async (id: string) => {
    const plugin = viewerRef.current?.getPlugin()
    if (!plugin) return
    const entry = useComparisonStore.getState().entries.find((e) => e.id === id)
    if (!entry) return

    const entryIdx = useComparisonStore.getState().entries.indexOf(entry)
    const structures = plugin.managers.structure.hierarchy.current.structures
    const mobileIdx = Math.min(entryIdx + 1, structures.length - 1)
    if (mobileIdx <= 0 || mobileIdx >= structures.length) return

    const nextHidden = entry.visible
    for (const component of structures[mobileIdx].components) {
      for (const repr of component.representations ?? []) {
        plugin.state.data.updateCellState(repr.cell.transform.ref, { isHidden: nextHidden })
      }
    }
    updateEntry(id, { visible: !entry.visible })
  }, [viewerRef, updateEntry])

  // ── remove a comparison structure ────────────────────────────────────────

  const removeComparison = useCallback(async (id: string) => {
    const plugin = viewerRef.current?.getPlugin()
    if (!plugin) return
    const entry = useComparisonStore.getState().entries.find((e) => e.id === id)
    if (!entry) return

    try {
      const entryIdx = useComparisonStore.getState().entries.indexOf(entry)
      const structures = plugin.managers.structure.hierarchy.current.structures
      const mobileIdx = Math.min(entryIdx + 1, structures.length - 1)
      if (mobileIdx > 0 && mobileIdx < structures.length) {
        await plugin.managers.structure.hierarchy.remove([structures[mobileIdx]])
      }
    } catch { /* ignore */ }
    removeEntry(id)
  }, [viewerRef, removeEntry])

  const clearComparisons = useCallback(async () => {
    for (const entry of [...useComparisonStore.getState().entries]) {
      await removeComparison(entry.id)
    }
  }, [removeComparison])

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full text-xs text-[var(--color-text-primary)]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border)] shrink-0">
        <span className="font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide text-[10px]">
          Comparisons
        </span>
        {entries.length > 0 && (
          <>
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent)] font-mono text-[10px]">
              {entries.length}
            </span>
            <button
              onClick={clearComparisons}
              disabled={busy}
              className="ml-auto px-2 py-1 rounded text-[10px] font-medium border border-[var(--color-border)] hover:bg-[var(--color-secondary-bg)] disabled:opacity-40"
            >
              Clear all
            </button>
          </>
        )}
      </div>

      {/* Status / error */}
      {status && (
        <div className="mx-3 mt-2 text-[10px] text-red-500 bg-red-50 dark:bg-red-950/30 rounded px-2 py-1 shrink-0">
          {status}
        </div>
      )}

      {/* Empty state */}
      {entries.length === 0 && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 px-6 text-center text-[var(--color-text-disabled)]">
          <span className="text-3xl">🔬</span>
          <div className="space-y-2">
            <p className="font-medium text-[var(--color-text-secondary)]">Overlay structures for comparison</p>
            <p className="text-[10px]">
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-secondary-bg)] border border-[var(--color-border)] font-mono">Ctrl</kbd>
              {' '}+{' '}
              <span className="font-medium">click</span> any file in the sidebar to overlay it on top of the current structure.
            </p>
            <p className="text-[10px]">Then click <strong>Align</strong> to superimpose by Cα atoms and compute RMSD.</p>
          </div>
        </div>
      )}

      {/* Entry list */}
      {entries.length > 0 && (
        <div className="flex flex-col gap-1 p-3 overflow-y-auto flex-1">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-2 rounded px-2 py-1.5 bg-[var(--color-secondary-bg)] border border-[var(--color-border)]"
            >
              {/* Color swatch */}
              <span
                className="w-3 h-3 rounded-sm shrink-0 border border-black/10"
                style={{ backgroundColor: `#${entry.color.toString(16).padStart(6, '0')}` }}
              />

              {/* Name */}
              <span className="flex-1 truncate font-mono text-[10px]">{entry.name}</span>

              {/* RMSD badge */}
              {entry.rmsd !== null ? (
                <span className="shrink-0 text-[10px] font-mono bg-[var(--color-accent)]/15 text-[var(--color-accent)] px-1.5 py-0.5 rounded" title="RMSD (Cα)">
                  {entry.rmsd.toFixed(2)} Å
                </span>
              ) : (
                <span className="shrink-0 text-[10px] text-[var(--color-text-disabled)]" title="Click Align to compute RMSD">—</span>
              )}

              {/* Align */}
              <button
                onClick={() => alignEntry(entry.id)}
                disabled={busy}
                title="Superimpose Cα atoms onto main structure and compute RMSD"
                className="shrink-0 px-1.5 py-0.5 rounded text-[10px] border border-[var(--color-border)] hover:bg-[var(--color-accent)]/10 hover:border-[var(--color-accent)]/40 hover:text-[var(--color-accent)] disabled:opacity-40 transition-colors"
              >
                {busy ? '…' : 'Align'}
              </button>

              {/* Visibility toggle */}
              <button
                onClick={() => toggleVisible(entry.id)}
                disabled={busy}
                title={entry.visible ? 'Hide' : 'Show'}
                className="shrink-0 text-[10px] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] disabled:opacity-40 transition-colors"
              >
                {entry.visible ? '👁' : '◌'}
              </button>

              {/* Remove */}
              <button
                onClick={() => removeComparison(entry.id)}
                disabled={busy}
                title="Remove overlay"
                className="shrink-0 text-[10px] text-[var(--color-text-disabled)] hover:text-red-500 disabled:opacity-40 transition-colors"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      {entries.length > 0 && (
        <div className="text-[9px] text-[var(--color-text-disabled)] px-3 pb-3 pt-2 border-t border-[var(--color-border)] shrink-0">
          <strong>Align</strong> superimposes Cα atoms onto the first-loaded structure and reports RMSD.
          Each overlay is tinted at 60% opacity. <kbd className="px-0.5 rounded bg-[var(--color-secondary-bg)] border border-[var(--color-border)]">Ctrl</kbd>+click more files in the sidebar to add more overlays.
        </div>
      )}
    </div>
  )
}

// ── CA atom coordinate extractor ─────────────────────────────────────────────

function extractCAPositions(structure: any): { x: number[]; y: number[]; z: number[] } {
  const x: number[] = [], y: number[] = [], z: number[] = []
  try {
    for (const unit of structure.units) {
      if (unit.kind !== 0) continue
      const { atoms } = unit.model.atomicHierarchy
      const conf = unit.model.atomicConformation
      for (let i = 0; i < unit.elements.length; i++) {
        const atomIdx = unit.elements[i]
        if (atoms.auth_atom_id.value(atomIdx) === 'CA') {
          x.push(conf.x[atomIdx])
          y.push(conf.y[atomIdx])
          z.push(conf.z[atomIdx])
        }
      }
    }
  } catch { /* gracefully return whatever we have */ }
  return { x, y, z }
}
