import { useRef, useState, useEffect } from 'react'
import { useDefaultLayout } from 'react-resizable-panels'
import { FolderOpen, Table2, ScatterChart, GitMerge, SlidersHorizontal, MousePointer2, Database, Sun, Moon, MessageSquare } from 'lucide-react'
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
import { useFileStore } from '@/stores/file-store'
import { useViewerPrefsStore } from '@/stores/viewer-prefs-store'
import { UpdateBanner } from './UpdateBanner'
import { PythonSetupModal } from './PythonSetupModal'

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
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') !== 'light')
  const [showPythonSetup, setShowPythonSetup] = useState(false)

  // Persist panel layout across sessions via localStorage.
  // useDefaultLayout reads/writes to localStorage keyed by `id`.
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'dc-main-layout',
    storage: localStorage,
    panelIds: ['left-panel', 'right-panel'],
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

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
        padding: '0 12px',
        height: 32,
        flexShrink: 0,
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-secondary-bg)',
      }}>
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
            fontSize: 10,
            color: 'var(--color-text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 320,
          }}>
            {activeFile.split('/').pop()?.split('\\').pop()}
          </span>
        )}

        <button
          onClick={() => setIsDark(d => !d)}
          style={{
            marginLeft: 'auto',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 10,
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

      {/* ── Main panel area ────────────────────────────────────────────────── */}
      {/*
        8px padding creates visible gaps between cards and window edges.
        react-resizable-panels measures the padded container, so percentage
        sizes remain stable. The handle spans the padded height, creating a
        clean gap between the two cards at its level.
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
          padding: 8,
          boxSizing: 'border-box',
        }}
      >

        {/* ── Left card: tabbed sidebar ── */}
        <ResizablePanel id="left-panel" defaultSize="38%" minSize="22%" maxSize="60%">
          <div style={{ ...cardStyle, paddingRight: 0 }}>
            {/*
              Tabs root is flex-col so TabsContent children can expand with flex-1.
            */}
            <Tabs
              defaultValue="files"
              style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
            >
              <TabsList>
                <TabsTrigger value="files"><FolderOpen size={12} strokeWidth={1.75} />Files</TabsTrigger>
                <TabsTrigger value="metrics"><Table2 size={12} strokeWidth={1.75} />Metrics</TabsTrigger>
                <TabsTrigger value="plot"><ScatterChart size={12} strokeWidth={1.75} />Plot</TabsTrigger>
                <TabsTrigger value="alignment"><GitMerge size={12} strokeWidth={1.75} />Align</TabsTrigger>
                <TabsTrigger value="filter"><SlidersHorizontal size={12} strokeWidth={1.75} />Filter</TabsTrigger>
                <span style={{ width: 1, height: 14, background: 'var(--color-border)', margin: '0 2px', flexShrink: 0 }} />
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

        {/* ── Right card: structure viewer ── */}
        <ResizablePanel id="right-panel" defaultSize="62%" minSize="30%">
          <div style={cardStyle}>
            <MolstarViewer
              ref={viewerRef}
              onStructureLoaded={(path) => { console.log('Loaded:', path) }}
              onError={(err) => { console.error('Viewer error:', err) }}
              onNeedPythonSetup={() => setShowPythonSetup(true)}
            />
          </div>
        </ResizablePanel>

      </ResizablePanelGroup>

      {showPythonSetup && (
        <PythonSetupModal
          onComplete={() => setShowPythonSetup(false)}
          onDismiss={() => setShowPythonSetup(false)}
        />
      )}
    </div>
  )
}
