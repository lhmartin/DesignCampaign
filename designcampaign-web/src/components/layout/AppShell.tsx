import { useRef, useState, useEffect } from 'react'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { FileBrowser } from '@/components/files/FileBrowser'
import { MolstarViewer, type MolstarViewerHandle } from '@/components/viewer/MolstarViewer'
import { MetricsTable } from '@/components/metrics/MetricsTable'
import { ScatterPlot } from '@/components/metrics/ScatterPlot'
import { CorrelationHeatmap } from '@/components/metrics/CorrelationHeatmap'
import { AlignmentViewer } from '@/components/metrics/AlignmentViewer'
import { SelectionPanel } from '@/components/selection/SelectionPanel'
import { FilterPanel } from '@/components/filter/FilterPanel'
import { useFileStore } from '@/stores/file-store'
import { UpdateBanner } from './UpdateBanner'
import { PythonSetupModal } from './PythonSetupModal'

// Shared card style — applied to each panel's inner wrapper
const cardStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  borderRadius: 10,
  border: '1px solid var(--color-border)',
  boxShadow: '0 2px 8px rgba(0,0,0,0.12), 0 4px 20px rgba(0,0,0,0.08)',
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

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  // Auto-restore last folder on startup (currentFolder hydrated by zustand-persist)
  useEffect(() => {
    if (currentFolder) setFolder(currentFolder)
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
          }}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? '☀ Light' : '☾ Dark'}
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
        orientation="horizontal"
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
        <ResizablePanel defaultSize="38%" minSize="22%" maxSize="60%">
          <div style={{ ...cardStyle, paddingRight: 0 }}>
            {/*
              Tabs root is flex-col so TabsContent children can expand with flex-1.
            */}
            <Tabs
              defaultValue="files"
              style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
            >
              <TabsList>
                <TabsTrigger value="files">Files</TabsTrigger>
                <TabsTrigger value="metrics">Metrics</TabsTrigger>
                <TabsTrigger value="plot">Plot</TabsTrigger>
                <TabsTrigger value="corr">Corr</TabsTrigger>
                <TabsTrigger value="alignment">Align</TabsTrigger>
                <TabsTrigger value="filter">Filter</TabsTrigger>
                <TabsTrigger value="selection">Selection</TabsTrigger>
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

              <TabsContent value="corr" forceMount>
                <CorrelationHeatmap />
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
            </Tabs>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* ── Right card: structure viewer ── */}
        <ResizablePanel defaultSize="62%" minSize="30%">
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
