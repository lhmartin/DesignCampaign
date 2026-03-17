import { useState } from 'react'
import type { ReactNode } from 'react'
import { useSelectionStore } from '@/stores/selection-store'

export type RepresentationStyle = 'cartoon' | 'ball-and-stick' | 'spacefill' | 'line' | 'gaussian-surface'
export type ColorScheme = 'sequence-id' | 'chain-id' | 'secondary-structure' | 'plddt-bands' | 'hydrophobicity' | 'element-symbol'

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
]

// ─── Inline SVG icons ─────────────────────────────────────────────────────────

function IconOrtho({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <rect x="1" y="4" width="8" height="8" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
      <rect x="5" y="1" width="8" height="8" rx="0.5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1"/>
      <line x1="1" y1="4" x2="5" y2="1" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="9" y1="4" x2="13" y2="1" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="1" y1="12" x2="5" y2="9" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="9" y1="12" x2="13" y2="9" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  )
}

function IconPerspective({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <polygon points="2,12 12,12 10,4 4,4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      <polygon points="5,4 9,4 8,1 6,1" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      <line x1="2" y1="12" x2="5" y2="4" stroke="currentColor" strokeWidth="1"/>
      <line x1="12" y1="12" x2="9" y2="4" stroke="currentColor" strokeWidth="1"/>
    </svg>
  )
}

function IconSun({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="7" y1="0.5" x2="7" y2="2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="7" y1="11.5" x2="7" y2="13.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="0.5" y1="7" x2="2.5" y2="7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="11.5" y1="7" x2="13.5" y2="7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="2.4" y1="2.4" x2="3.8" y2="3.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="10.2" y1="10.2" x2="11.6" y2="11.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="11.6" y1="2.4" x2="10.2" y2="3.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="3.8" y1="10.2" x2="2.4" y2="11.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

function IconMoon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M11 7.5A4.5 4.5 0 0 1 6.5 3c0-.5.07-1 .2-1.4A5.5 5.5 0 1 0 12.4 7.3c-.45.13-.92.2-1.4.2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    </svg>
  )
}

function IconSpin({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M12 7A5 5 0 1 1 9 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <polyline points="9,0.5 9,3 11.5,3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconAO({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="7" cy="7" r="3.5" stroke="currentColor" strokeWidth="1" strokeOpacity="0.7"/>
      <circle cx="7" cy="7" r="1.5" fill="currentColor" fillOpacity="0.5"/>
    </svg>
  )
}

function IconReset({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="7" y1="2" x2="7" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="7" y1="10" x2="7" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="2" y1="7" x2="4" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="10" y1="7" x2="12" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="7" cy="7" r="1.5" fill="currentColor"/>
    </svg>
  )
}

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
        borderRadius: 5,
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
        borderRadius: 5,
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
        {cameraMode === 'perspective' ? <IconPerspective /> : <IconOrtho />}
      </IBtn>

      {/* Background */}
      <IBtn
        active={viewerBg === 'light'}
        onClick={() => onViewerBgChange(viewerBg === 'dark' ? 'light' : 'dark')}
        title={viewerBg === 'dark' ? 'Light Background' : 'Dark Background'}
      >
        {viewerBg === 'dark' ? <IconMoon /> : <IconSun />}
      </IBtn>

      {/* Auto-spin */}
      <IBtn
        active={spinning}
        onClick={() => onSpinChange(!spinning)}
        title={spinning ? 'Stop Rotation' : 'Auto-Rotate'}
      >
        <IconSpin />
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
            fontSize: 9,
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
        <IconAO />
      </IBtn>

      {/* Reset view */}
      <IBtn active={false} onClick={onResetView} title="Reset Camera">
        <IconReset />
      </IBtn>

      <Divider />

      {/* Selection badge */}
      <SelectionBadge />

    </div>
  )
}
