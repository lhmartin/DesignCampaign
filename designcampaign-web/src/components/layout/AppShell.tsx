import { useRef, useState, useEffect } from 'react'
import { useDefaultLayout } from 'react-resizable-panels'
import { getFileName } from '@/lib/utils'
import { FolderOpen, Table2, ScatterChart, GitMerge, SlidersHorizontal, MousePointer2, Database, Sun, Moon, MessageSquare, BookOpen } from 'lucide-react'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { FileBrowser } from '@/components/files/FileBrowser'
import { MolstarViewer, type MolstarViewerHandle } from '@/components/viewer/MolstarViewer'
import { MetricsTable } from '@/components/metrics/MetricsTable'
import { ScatterPlot } from '@/components/metrics/ScatterPlot'
import { AlignmentViewer } from '@/components/metrics/AlignmentViewer'
import { SelectionPanel } from '@/components/selection/SelectionPanel'
import { FilterPanel } from '@/components/filter/FilterPanel'
import { UniProtPanel } from '@/components/metrics/UniProtPanel'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { MarimoTab } from '@/components/notebook/MarimoTab'
import { DetailsInspector } from '@/components/inspector/DetailsInspector'
import { readViewerBg } from '@/components/viewer/viewer-bg'
import { useFileStore } from '@/stores/file-store'
import { useViewerPrefsStore } from '@/stores/viewer-prefs-store'
import { useUIStore } from '@/stores/ui-store'
import { hydrateInterfaceFromBatch } from '@/stores/interface-store'
import { useBatchInterfaceStore } from '@/stores/batch-interface-store'
import { applyToAllRepresentations } from '@/components/viewer/MolstarViewer'
import { INTERFACE_THEME_ID } from '@/components/viewer/themes/interface-theme'
import { UpdateBanner } from './UpdateBanner'
import { PythonSetupModal } from './PythonSetupModal'
import { OnboardingTour } from './OnboardingTour'

// Shared card style — applied to each panel's inner wrapper
const cardStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  boxShadow: 'var(--shadow-card)',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--color-secondary-bg)',
  boxSizing: 'border-box',
}

export function AppShell() {
  const viewerRef = useRef<MolstarViewerHandle>(null)
  const { activeFile, currentFolder, setFolder } = useFileStore()
  const { activeTab, setActiveTab } = useUIStore()
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') !== 'light')
  const isMac     = window.electronAPI?.platform === 'darwin'
  const isWindows = window.electronAPI?.platform === 'win32'
  const [showPythonSetup, setShowPythonSetup] = useState(false)
  const [rightPanelMode, setRightPanelMode] = useState<'viewer' | 'notebook'>('viewer')
  const [showTour, setShowTour] = useState(() => !localStorage.getItem('dc-onboarding-done'))

  // Persist panel layout across sessions via localStorage.
  // useDefaultLayout reads/writes to localStorage keyed by `id`.
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'dc-main-layout-v2',
    storage: localStorage,
    panelIds: ['left-panel', 'center-panel', 'right-panel'],
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
    window.electronAPI?.setTitleBarOverlay?.(isDark
      ? { color: '#1c2340', symbolColor: '#c4d4ec' }
      : { color: '#ffffff', symbolColor: '#111827' }
    )
    // Push the new --color-viewer-bg into the Mol* canvas so it blends with the card.
    const plugin = viewerRef.current?.getPlugin() as { canvas3d?: { setProps: (p: unknown) => void } } | null
    try { plugin?.canvas3d?.setProps({ renderer: { backgroundColor: readViewerBg() } }) } catch { /* best effort */ }
  }, [isDark])

  useEffect(() => {
    if (!activeFile) return
    hydrateInterfaceFromBatch(useBatchInterfaceStore.getState().results[activeFile])
  }, [activeFile])

  // Auto-restore last folder and last active file on startup.
  // Both values are hydrated by zustand-persist before the first render.
  // requestLoadFile sets requestedFilePath in viewer-prefs-store; MolstarViewer
  // picks it up once the Mol* plugin is ready (no timing hacks needed).
  useEffect(() => {
    if (currentFolder) setFolder(currentFolder)
    const lastFile = useFileStore.getState().activeFile
    if (lastFile) useViewerPrefsStore.getState().requestLoadFile(lastFile)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally runs once on mount

  useEffect(() => {
    window.electronAPI?.pythonSetupStatus()
      .then(({ ready }) => { if (!ready) setShowPythonSetup(true) })
      .catch(() => {})
  }, [])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      background: 'var(--color-background)',
    }}>

      {/* ── Update banner (visible only when a new version is ready) ──────── */}
      <UpdateBanner />

      {/* ── Title bar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        paddingLeft: isMac ? 80 : 12,
        paddingRight: isWindows ? 150 : 12,
        height: 42,
        flexShrink: 0,
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-secondary-bg)',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}>
        <span style={{
          fontFamily: 'Outfit, sans-serif',
          fontWeight: 600,
          fontSize: 12,
          letterSpacing: '0.06em',
          color: 'var(--color-accent)',
        }}>
          DesignCampaign
        </span>

        {activeFile && (
          <span style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11,
            color: 'var(--color-text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 320,
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}>
            {getFileName(activeFile)}
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={() => setShowTour(true)}
            title="Show feature tour"
            style={{
              padding: '2px 7px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--color-text-disabled)',
              border: '1px solid var(--color-border)',
              background: 'transparent',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ?
          </button>
          <button
            onClick={() => setRightPanelMode(m => m === 'viewer' ? 'notebook' : 'viewer')}
            title={rightPanelMode === 'viewer' ? 'Open Marimo notebook' : 'Back to structure viewer'}
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 11,
              color: rightPanelMode === 'notebook' ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              border: `1px solid ${rightPanelMode === 'notebook' ? 'var(--color-accent)' : 'var(--color-border)'}`,
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <BookOpen size={11} />
            Notebook
          </button>
          <button
            onClick={() => setIsDark(d => !d)}
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 11,
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <><Sun size={11} />Light</> : <><Moon size={11} />Dark</>}
          </button>
        </div>
      </div>

      {/* ── Main panel area ────────────────────────────────────────────────── */}
      {/*
        12px padding creates visible gaps between cards and window edges.
        react-resizable-panels measures the padded container, so percentage
        sizes remain stable. Handles span the padded height, creating clean
        gaps between the three cards at their respective levels.
      */}
      <ResizablePanelGroup
        id="main-layout"
        orientation="horizontal"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          overflow: 'hidden',
          padding: 12,
          boxSizing: 'border-box',
        }}
      >

        {/* ── Left card: tabbed sidebar ── */}
        <ResizablePanel id="left-panel" defaultSize="28%" minSize="18%" maxSize="45%">
          <div style={{ ...cardStyle, paddingRight: 0 }}>
            {/*
              Tabs root is flex-col so TabsContent children can expand with flex-1.
            */}
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
            >
              <TabsList>
                <TabsTrigger value="files" data-tour="tab-files"><FolderOpen size={12} strokeWidth={1.75} />Files</TabsTrigger>
                <TabsTrigger value="metrics" data-tour="tab-metrics"><Table2 size={12} strokeWidth={1.75} />Metrics</TabsTrigger>
                <TabsTrigger value="plot" data-tour="tab-plot"><ScatterChart size={12} strokeWidth={1.75} />Plot</TabsTrigger>
                <TabsTrigger value="alignment"><GitMerge size={12} strokeWidth={1.75} />Align</TabsTrigger>
                <TabsTrigger value="filter" data-tour="tab-filter"><SlidersHorizontal size={12} strokeWidth={1.75} />Filter</TabsTrigger>
                <span style={{ width: 2, height: 16, background: 'var(--color-border)', margin: '0 4px', flexShrink: 0, borderRadius: 1 }} />
                <TabsTrigger value="selection"><MousePointer2 size={12} strokeWidth={1.75} />Selection</TabsTrigger>
                <TabsTrigger value="uniprot"><Database size={12} strokeWidth={1.75} />UniProt</TabsTrigger>
                <TabsTrigger value="chat"><MessageSquare size={12} strokeWidth={1.75} />Chat</TabsTrigger>
              </TabsList>

              <TabsContent value="files">
                <FileBrowser viewerRef={viewerRef} />
              </TabsContent>

              <TabsContent value="metrics">
                <MetricsTable viewerRef={viewerRef} />
              </TabsContent>

              <TabsContent value="plot" forceMount>
                <ScatterPlot viewerRef={viewerRef} />
              </TabsContent>

              <TabsContent value="alignment">
                <AlignmentViewer viewerRef={viewerRef} />
              </TabsContent>

              <TabsContent value="filter">
                <FilterPanel />
              </TabsContent>

              <TabsContent value="selection">
                <SelectionPanel />
              </TabsContent>

              <TabsContent value="uniprot">
                <UniProtPanel />
              </TabsContent>

              <TabsContent value="chat">
                <ChatPanel />
              </TabsContent>
            </Tabs>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* ── Center card: structure viewer / notebook ── */}
        <ResizablePanel id="center-panel" defaultSize="45%" minSize="30%">
          <div data-tour="right-panel" style={{ ...cardStyle, position: 'relative' }}>

            {/* Mol* viewer — hidden but kept mounted when in notebook mode */}
            <div style={{
              position: 'absolute', inset: 0,
              visibility: rightPanelMode === 'viewer' ? 'visible' : 'hidden',
              pointerEvents: rightPanelMode === 'viewer' ? 'auto' : 'none',
            }}>
              <MolstarViewer
                ref={viewerRef}
                onStructureLoaded={(path) => {
                  const batch = useBatchInterfaceStore.getState().results[path]
                  if (batch) {
                    const plugin = viewerRef.current?.getPlugin()
                    if (plugin) {
                      applyToAllRepresentations(plugin, (old: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
                        ...old, colorTheme: { name: INTERFACE_THEME_ID, params: {} },
                      }))
                    }
                  }
                }}
                onError={(err) => { console.error('Viewer error:', err) }}
                onNeedPythonSetup={() => setShowPythonSetup(true)}
              />
            </div>

            {/* Marimo tab — kept mounted when running so WebSocket stays alive */}
            <div style={{
              position: 'absolute', inset: 0,
              visibility: rightPanelMode === 'notebook' ? 'visible' : 'hidden',
              pointerEvents: rightPanelMode === 'notebook' ? 'auto' : 'none',
            }}>
              <MarimoTab />
            </div>

          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* ── Right card: details inspector ── */}
        <ResizablePanel id="right-panel" defaultSize="27%" minSize="18%" maxSize="45%">
          <div style={cardStyle}>
            <DetailsInspector />
          </div>
        </ResizablePanel>

      </ResizablePanelGroup>

      {showPythonSetup && (
        <PythonSetupModal
          onComplete={() => setShowPythonSetup(false)}
          onDismiss={() => setShowPythonSetup(false)}
        />
      )}

      {showTour && <OnboardingTour onDone={() => setShowTour(false)} />}
    </div>
  )
}
