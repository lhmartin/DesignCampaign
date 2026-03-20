import { useState } from 'react'
import type { ReactNode } from 'react'
import { Box, Square, Sun, Moon, RotateCw, Layers, Home } from 'lucide-react'
import { useSelectionStore } from '@/stores/selection-store'

export type RepresentationStyle = 'cartoon' | 'ball-and-stick' | 'spacefill' | 'line' | 'gaussian-surface'
export type ColorScheme = 'sequence-id' | 'chain-id' | 'secondary-structure' | 'plddt-bands' | 'hydrophobicity' | 'element-symbol' | 'rmsd-deviation' | 'named-selection'

const STYLE_OPTIONS: { value: RepresentationStyle; label: string }[] = [
  { value: 'cartoon',          label: 'Cartoon' },
  { value: 'ball-and-stick',   label: 'Ball & Stick' },
  { value: 'spacefill',        label: 'Spacefill' },
  { value: 'line',             label: 'Wireframe' },
  { value: 'gaussian-surface', label: 'Surface' },
]

const COLOR_OPTIONS: { value: ColorScheme; label: string }[] = [
  { value: 'sequence-id',         label: 'Spectrum (N→C)' },
  { value: 'chain-id',            label: 'Chain' },
  { value: 'secondary-structure', label: 'Sec. Structure' },
  { value: 'plddt-bands',         label: 'pLDDT / B-factor' },
  { value: 'hydrophobicity',      label: 'Hydrophobicity' },
  { value: 'element-symbol',      label: 'Element' },
  { value: 'rmsd-deviation',      label: 'RMSD Deviation' },
  { value: 'named-selection',     label: 'Named Selections' },
]

// ─── Toolbar divider ──────────────────────────────────────────────────────────
function Divider() {
  return (
    <div style={{
      width: 1,
      height: 18,
      background: 'var(--color-border)',
      margin: '0 4px',
      flexShrink: 0,
    }} />
  )
}

// ─── Compact select ───────────────────────────────────────────────────────────
function Sel<T extends string>({
  value, options, onChange, width = 118,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  width?: number
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as T)}
      style={{
        width,
        fontSize: 11,
        fontFamily: 'Outfit, sans-serif',
        color: 'var(--color-text-primary)',
        background: 'var(--color-background)',
        border: '1px solid var(--color-border)',
        borderRadius: 6,
        padding: '3px 18px 3px 7px',
        outline: 'none',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

// ─── Icon button ──────────────────────────────────────────────────────────────
function IBtn({
  active, onClick, title, children,
}: {
  active?: boolean
  onClick: () => void
  title: string
  children: ReactNode
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        borderRadius: 6,
        border: active
          ? '1px solid var(--color-accent)'
          : '1px solid var(--color-border)',
        background: active
          ? 'color-mix(in srgb, var(--color-accent) 14%, transparent)'
          : hovered
            ? 'var(--color-border)'
            : 'transparent',
        color: active
          ? 'var(--color-accent)'
          : hovered
            ? 'var(--color-text-primary)'
            : 'var(--color-text-secondary)',
        cursor: 'pointer',
        transition: 'all 0.12s',
        flexShrink: 0,
        padding: 0,
      }}
    >
      {children}
    </button>
  )
}

// ─── Selection badge ──────────────────────────────────────────────────────────
function SelectionBadge() {
  const residues = useSelectionStore(s => s.selectedResidues)
  const count = residues.size
  if (count === 0) return null
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 5,
      padding: '2px 8px 2px 6px',
      borderRadius: 10,
      background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)',
      border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
      fontSize: 10,
      color: 'var(--color-accent)',
      fontFamily: 'JetBrains Mono, monospace',
      whiteSpace: 'nowrap',
    }}>
      <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
        <circle cx="4" cy="4" r="3" fill="currentColor"/>
      </svg>
      {count} res
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export interface ViewerControlsProps {
  style: RepresentationStyle
  colorScheme: ColorScheme
  onStyleChange: (v: RepresentationStyle) => void
  onColorChange: (v: ColorScheme) => void
  cameraMode: 'perspective' | 'orthographic'
  viewerBg: 'dark' | 'light'
  spinning: boolean
  spinSpeed: number
  showAO: boolean
  onCameraModeChange: (v: 'perspective' | 'orthographic') => void
  onViewerBgChange: (v: 'dark' | 'light') => void
  onSpinChange: (v: boolean) => void
  onSpinSpeedChange: (v: number) => void
  onAOChange: (v: boolean) => void
  onResetView: () => void
}

export function ViewerControls({
  style, colorScheme, onStyleChange, onColorChange,
  cameraMode, viewerBg, spinning, spinSpeed, showAO,
  onCameraModeChange, onViewerBgChange, onSpinChange, onSpinSpeedChange, onAOChange,
  onResetView,
}: ViewerControlsProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '0 10px',
      height: 38,
      flexShrink: 0,
      background: 'var(--color-secondary-bg)',
      borderBottom: '1px solid var(--color-border)',
      overflowX: 'auto',
      overflowY: 'hidden',
    }}>

      {/* Representation style */}
      <Sel value={style} options={STYLE_OPTIONS} onChange={onStyleChange} width={108} />

      <Divider />

      {/* Color scheme */}
      <Sel value={colorScheme} options={COLOR_OPTIONS} onChange={onColorChange} width={130} />

      <Divider />

      {/* Camera mode */}
      <IBtn
        active={cameraMode === 'orthographic'}
        onClick={() => onCameraModeChange(cameraMode === 'perspective' ? 'orthographic' : 'perspective')}
        title={cameraMode === 'perspective' ? 'Switch to Orthographic' : 'Switch to Perspective'}
      >
        {cameraMode === 'perspective' ? <Box size={13} strokeWidth={1.75} /> : <Square size={13} strokeWidth={1.75} />}
      </IBtn>

      {/* Background */}
      <IBtn
        active={viewerBg === 'light'}
        onClick={() => onViewerBgChange(viewerBg === 'dark' ? 'light' : 'dark')}
        title={viewerBg === 'dark' ? 'Light Background' : 'Dark Background'}
      >
        {viewerBg === 'dark' ? <Moon size={13} strokeWidth={1.75} /> : <Sun size={13} strokeWidth={1.75} />}
      </IBtn>

      {/* Auto-spin */}
      <IBtn
        active={spinning}
        onClick={() => onSpinChange(!spinning)}
        title={spinning ? 'Stop Rotation' : 'Auto-Rotate'}
      >
        <RotateCw size={13} strokeWidth={1.75} />
      </IBtn>

      {/* Speed slider — only visible while spinning */}
      {spinning && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <input
            type="range"
            min={0.05}
            max={1.0}
            step={0.05}
            value={spinSpeed}
            onChange={e => onSpinSpeedChange(Number(e.target.value))}
            style={{ width: 68, cursor: 'pointer', accentColor: 'var(--color-accent)', flexShrink: 0 }}
            title={`Rotation speed: 1 revolution every ${Math.round(1 / spinSpeed)}s`}
          />
          <span style={{
            fontSize: 11,
            fontFamily: 'JetBrains Mono, monospace',
            color: 'var(--color-text-secondary)',
            width: 24,
            textAlign: 'right',
            flexShrink: 0,
          }}>
            {Math.round(1 / spinSpeed)}s
          </span>
        </div>
      )}

      {/* Ambient occlusion */}
      <IBtn
        active={showAO}
        onClick={() => onAOChange(!showAO)}
        title={showAO ? 'Disable Ambient Occlusion' : 'Enable Ambient Occlusion'}
      >
        <Layers size={13} strokeWidth={1.75} />
      </IBtn>

      {/* Reset view */}
      <IBtn active={false} onClick={onResetView} title="Reset Camera">
        <Home size={13} strokeWidth={1.75} />
      </IBtn>

      <Divider />

      {/* Selection badge */}
      <SelectionBadge />

    </div>
  )
}
