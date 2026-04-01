import { useEffect, useState, useCallback, useMemo } from 'react'

interface Step {
  selector: string | null
  title: string
  body: string
  placement: 'right' | 'left' | 'center'
}

const STEPS: Step[] = [
  {
    selector: null,
    title: 'Welcome to DesignCampaign',
    body: 'A workspace for exploring protein structure design campaigns. This short tour highlights the key areas — takes about 30 seconds.',
    placement: 'center',
  },
  {
    selector: '[data-tour="tab-files"]',
    title: 'Open a campaign folder',
    body: 'Start here. Click Open Folder to load a directory of PDB or mmCIF structures from your design run. All files are listed and browsable.',
    placement: 'right',
  },
  {
    selector: '[data-tour="tab-metrics"]',
    title: 'Metrics table',
    body: 'Click Calculate Metrics to compute structural quality scores for every design at once — pLDDT, contacts, PAE, and more. Sort, filter, and export as CSV.',
    placement: 'right',
  },
  {
    selector: '[data-tour="tab-plot"]',
    title: 'Scatter & histogram plots',
    body: 'Plot any two metrics against each other. Use the Color axis to encode a third dimension, or switch to Pareto mode to find the non-dominated front.',
    placement: 'right',
  },
  {
    selector: '[data-tour="right-panel"]',
    title: '3D structure viewer',
    body: 'Click any design in the file browser, metrics table, or scatter plot to load it here instantly. Use the controls to change representation and coloring.',
    placement: 'left',
  },
  {
    selector: '[data-tour="tab-filter"]',
    title: 'Filter designs',
    body: 'Set numeric thresholds on any metric to narrow your campaign. Filtered-out structures are dimmed in plots but not removed — easy to adjust.',
    placement: 'right',
  },
  {
    selector: null,
    title: "You're ready",
    body: 'Double-click a structure name to rename it. Drag the panel divider to resize. Reopen this tour any time with the ? button in the title bar.',
    placement: 'center',
  },
]

const SPOTLIGHT_PAD = 8
const CARD_WIDTH = 292

interface SpotRect { top: number; left: number; width: number; height: number }

function measureTarget(selector: string): SpotRect | null {
  const el = document.querySelector(selector)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return {
    top: r.top - SPOTLIGHT_PAD,
    left: r.left - SPOTLIGHT_PAD,
    width: r.width + SPOTLIGHT_PAD * 2,
    height: r.height + SPOTLIGHT_PAD * 2,
  }
}

function cardStyle(rect: SpotRect | null, placement: Step['placement']): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'fixed',
    width: CARD_WIDTH,
    zIndex: 9999,
    pointerEvents: 'auto',
  }
  const GAP = 16
  if (!rect || placement === 'center') {
    return { ...base, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }
  const vh = window.innerHeight
  const vw = window.innerWidth
  const topClamped = Math.max(GAP, Math.min(rect.top, vh - 220))
  if (placement === 'right') {
    const left = rect.left + rect.width + GAP
    return left + CARD_WIDTH + GAP > vw
      ? { ...base, top: topClamped, right: GAP }
      : { ...base, top: topClamped, left }
  }
  // left
  const left = rect.left - CARD_WIDTH - GAP
  return left < GAP
    ? { ...base, top: topClamped, left: GAP }
    : { ...base, top: topClamped, left }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OnboardingTour({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<SpotRect | null>(null)
  const current = STEPS[step]

  const finish = useCallback(() => {
    localStorage.setItem('dc-onboarding-done', '1')
    onDone()
  }, [onDone])

  // Measure target element whenever step changes
  useEffect(() => {
    if (!current.selector) { setRect(null); return }
    const measure = () => setRect(measureTarget(current.selector!))
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [step, current.selector])

  // Keyboard navigation — uses functional setStep so no step dependency, never re-registers
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { localStorage.setItem('dc-onboarding-done', '1'); onDone() }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') setStep(s => s < STEPS.length - 1 ? s + 1 : (onDone(), s))
      else if (e.key === 'ArrowLeft') setStep(s => Math.max(0, s - 1))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onDone]) // eslint-disable-line react-hooks/exhaustive-deps

  const cs = useMemo(() => cardStyle(rect, current.placement), [rect, current.placement])
  const isFirst = step === 0
  const isLast = step === STEPS.length - 1

  return (
    <>
      {/* Full-screen click-blocker (clicking anywhere advances) */}
      <div
        onClick={() => setStep(s => s < STEPS.length - 1 ? s + 1 : s)}
        style={{ position: 'fixed', inset: 0, zIndex: 9996, cursor: 'pointer' }}
      />

      {/* Overlay — full-screen dim when no target; spotlight ring via box-shadow when target exists */}
      <div style={{
        position: 'fixed', zIndex: 9997, pointerEvents: 'none',
        transition: 'top 0.22s cubic-bezier(.4,0,.2,1), left 0.22s cubic-bezier(.4,0,.2,1), width 0.22s cubic-bezier(.4,0,.2,1), height 0.22s cubic-bezier(.4,0,.2,1)',
        ...(rect ? {
          top: rect.top, left: rect.left, width: rect.width, height: rect.height,
          borderRadius: 8,
          boxShadow: '0 0 0 9999px rgba(10, 15, 35, 0.75)',
          outline: '1.5px solid rgba(0,200,168,0.55)',
        } : {
          inset: 0,
          background: 'rgba(10, 15, 35, 0.75)',
        }),
      }} />

      {/* Step card */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          ...cs,
          background: 'var(--color-secondary-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          boxShadow: '0 12px 40px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.2)',
          padding: '20px 20px 16px',
          fontFamily: 'Outfit, sans-serif',
          animation: 'tourCardIn 0.18s ease',
        }}
      >
        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 3, marginBottom: 16 }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                height: 3,
                flex: i === step ? 2 : 1,
                borderRadius: 2,
                background: i <= step ? 'var(--color-accent)' : 'var(--color-border)',
                opacity: i < step ? 0.45 : 1,
                transition: 'flex 0.2s ease, background 0.2s ease',
              }}
            />
          ))}
        </div>

        {/* Step counter */}
        <div style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: 'var(--color-accent)', marginBottom: 6, opacity: 0.8,
        }}>
          {isFirst ? 'Tour' : isLast ? 'All done' : `Step ${step} of ${STEPS.length - 2}`}
        </div>

        <h3 style={{
          margin: '0 0 9px', fontSize: 15, fontWeight: 600,
          color: 'var(--color-text-primary)', letterSpacing: '-0.015em', lineHeight: 1.25,
        }}>
          {current.title}
        </h3>
        <p style={{
          margin: '0 0 18px', fontSize: 12, lineHeight: 1.65,
          color: 'var(--color-text-secondary)',
        }}>
          {current.body}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              style={{
                padding: '5px 13px', borderRadius: 6, fontSize: 11,
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)', background: 'transparent', cursor: 'pointer',
              }}
            >
              ← Back
            </button>
          )}
          <button
            onClick={() => step < STEPS.length - 1 ? setStep(s => s + 1) : finish()}
            style={{
              padding: '5px 16px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              border: 'none',
              color: 'var(--color-primary-foreground)',
              background: 'var(--color-accent)',
              cursor: 'pointer',
              marginLeft: step > 0 ? 0 : 'auto',
            }}
          >
            {isLast ? 'Get started' : 'Next →'}
          </button>
          {!isLast && (
            <button
              onClick={finish}
              style={{
                marginLeft: 'auto', padding: '5px 8px', borderRadius: 6, fontSize: 10,
                border: 'none', color: 'var(--color-text-disabled)', background: 'transparent', cursor: 'pointer',
              }}
            >
              Skip tour
            </button>
          )}
        </div>

        {isFirst && (
          <p style={{
            margin: '12px 0 0', fontSize: 10, textAlign: 'center',
            color: 'var(--color-text-disabled)', lineHeight: 1.5,
          }}>
            ← → arrow keys or click anywhere to navigate
          </p>
        )}
      </div>
    </>
  )
}
