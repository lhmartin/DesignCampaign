import { useEffect, useRef, useState, useMemo, type RefObject } from 'react'
import { FolderOpen, LayoutGrid, Search, X } from 'lucide-react'
import { useFileStore } from '@/stores/file-store'
import { useProteinStore } from '@/stores/protein-store'
import { useGroupStore } from '@/stores/group-store'
import { useMetricsStore } from '@/stores/metrics-store'
import { useFilterStore } from '@/stores/filter-store'
import { formatFileSize } from '@/lib/utils'
import type { MolstarViewerHandle } from '@/components/viewer/MolstarViewer'
import type { FileInfo } from '@/types/electron'
import { APP_DEFAULTS } from '@/lib/constants/app'
import { FileTree } from './FileTree'
import { readFileContent } from '@/lib/fsa'


interface FileBrowserProps {
  viewerRef: RefObject<MolstarViewerHandle | null>
}

// ── Directory tree data structure ─────────────────────────────────────────────

interface DirNode {
  name: string
  relPath: string         // path relative to opened folder root (used as key)
  subdirs: DirNode[]
  files: FileInfo[]
}

/** Convert flat FileInfo list into a nested directory tree. */
function buildDirTree(files: FileInfo[], currentFolder: string | null): DirNode {
  const root: DirNode = { name: '', relPath: '', subdirs: [], files: [] }

  for (const file of files) {
    // Compute relative path: strip absolute currentFolder prefix for Electron paths
    let rel = file.path.replace(/\\/g, '/')
    if (currentFolder) {
      const base = currentFolder.replace(/\\/g, '/').replace(/\/$/, '') + '/'
      if (rel.startsWith(base)) rel = rel.slice(base.length)
    }

    const parts = rel.split('/')
    const dirParts = parts.slice(0, -1)

    let cur = root
    for (let i = 0; i < dirParts.length; i++) {
      const dirName = dirParts[i]
      const dirPath = dirParts.slice(0, i + 1).join('/')
      let child = cur.subdirs.find(d => d.name === dirName)
      if (!child) {
        child = { name: dirName, relPath: dirPath, subdirs: [], files: [] }
        cur.subdirs.push(child)
      }
      cur = child
    }
    cur.files.push(file)
  }

  return root
}

// ── Main component ────────────────────────────────────────────────────────────

export function FileBrowser({ viewerRef }: FileBrowserProps) {
  const { currentFolder, files, activeFile, isScanning, openFolder, refreshFiles, setActiveFile } =
    useFileStore()
  const { setLoading } = useProteinStore()
  const { groups, isGrouping, progress, startGrouping, clearGroups, viewMode, setViewMode } = useGroupStore()
  const { autoLoadSidecars, clearAll: clearMetrics } = useMetricsStore()
  const hasSetupListeners = useRef(false)
  const lastGroupedFilesRef = useRef<typeof files | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [fileSearchInput, setFileSearchInput] = useState('')
  const [fileSearch, setFileSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // Debounce search input to avoid filtering 10k+ files on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setFileSearch(fileSearchInput), 150)
    return () => clearTimeout(t)
  }, [fileSearchInput])

  const FILE_LIMIT = 100

  const searchResults = useMemo(() => {
    const q = fileSearch.trim().toLowerCase()
    if (!q) return null
    const matches = files.filter(f => f.name.toLowerCase().includes(q))
    return { shown: matches.slice(0, FILE_LIMIT), total: matches.length }
  }, [files, fileSearch])

  // Listen for menu shortcuts from Electron main process
  useEffect(() => {
    if (hasSetupListeners.current || !window.electronAPI) return
    hasSetupListeners.current = true
    const cleanupOpen = window.electronAPI.onMenuOpenFolder(openFolder)
    const cleanupRefresh = window.electronAPI.onMenuRefresh(refreshFiles)
    return () => { cleanupOpen(); cleanupRefresh() }
  }, [openFolder, refreshFiles])

  // When the file list changes: clear stale state, restart grouping, scan for JSON sidecars.
  // Guard against re-running on remount (tab switch) — Zustand only creates a new files array
  // when setFolder is called, so same reference means grouping is already in progress or done.
  useEffect(() => {
    if (files.length === 0) {
      clearGroups(); clearMetrics(); setExpanded(new Set())
      lastGroupedFilesRef.current = null
      return
    }
    if (files === lastGroupedFilesRef.current) return
    lastGroupedFilesRef.current = files

    const readFile = window.electronAPI
      ? (p: string) => window.electronAPI!.readFile(p)
      : readFileContent
    startGrouping(files, readFile)
    autoLoadSidecars(files, readFile)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files])

  const handleFileClick = async (file: FileInfo, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd+click → overlay as comparison (no scene clear)
      await viewerRef.current?.loadAsComparison(file.path)
      return
    }
    if (activeFile === file.path) return
    setActiveFile(file.path)
    setLoading(true)
    try { await viewerRef.current?.loadFromFile(file.path) }
    finally { setLoading(false) }
  }

  const toggleDir = (relPath: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(relPath)) next.delete(relPath)
      else next.add(relPath)
      return next
    })
  }

  const hasGroups = groups.length > 0
  const dirTree = buildDirTree(files, currentFolder)

  return (
    <div className="flex flex-col h-full bg-[var(--color-background)]">
      {/* Header toolbar */}
      <div className="flex items-center gap-1 px-2 py-2 border-b border-[var(--color-border)] shrink-0">
        <button
          onClick={openFolder}
          className="flex items-center gap-1.5 px-2 py-1 text-xs rounded hover:bg-[var(--color-secondary-bg)] text-[var(--color-text-primary)] transition-colors"
          title="Open Folder (Ctrl+O)"
        >
          <FolderIcon />
          Open Folder
        </button>
        {currentFolder && (
          <button
            onClick={refreshFiles}
            disabled={isScanning}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-[var(--color-secondary-bg)] text-[var(--color-text-secondary)] transition-colors disabled:opacity-50"
            title="Refresh (Ctrl+R)"
          >
            <RefreshIcon spinning={isScanning} />
          </button>
        )}
        {/* View mode toggle (only show when groups are ready) */}
        {currentFolder && hasGroups && (
          <div className="ml-auto flex items-center gap-0.5 bg-[var(--color-secondary-bg)] rounded p-0.5">
            <button
              onClick={() => setViewMode('tree')}
              title="Folder tree view"
              className={`flex items-center px-1.5 py-0.5 rounded text-[10px] transition-colors ${viewMode === 'tree' ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
            >
              <FolderOpen size={13} />
            </button>
            <button
              onClick={() => setViewMode('groups')}
              title="Sequence-identity groups view"
              className={`flex items-center px-1.5 py-0.5 rounded text-[10px] transition-colors ${viewMode === 'groups' ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
            >
              <LayoutGrid size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Folder path */}
      {currentFolder && (
        <div className="px-2 py-1 text-[10px] text-[var(--color-text-secondary)] truncate border-b border-[var(--color-border)] shrink-0 font-mono">
          {currentFolder.split(/[/\\]/).pop() ?? currentFolder}
        </div>
      )}

      {/* Search */}
      {currentFolder && files.length > 0 && (
        <div className="px-2 py-1.5 border-b border-[var(--color-border)] shrink-0">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--color-primary-bg)] border border-[var(--color-border)]">
            <Search size={11} className="text-[var(--color-text-disabled)] shrink-0" />
            <input
              ref={searchRef}
              value={fileSearchInput}
              onChange={e => setFileSearchInput(e.target.value)}
              placeholder="Search files…"
              className="flex-1 bg-transparent text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-disabled)] outline-none min-w-0"
            />
            {fileSearchInput && (
              <button onClick={() => setFileSearchInput('')} className="text-[var(--color-text-disabled)] hover:text-[var(--color-text-secondary)]">
                <X size={11} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Grouping progress bar */}
      {isGrouping && (
        <div className="px-2 py-1 shrink-0 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-[var(--color-border)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--color-accent)] rounded-full transition-all duration-150"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-[var(--color-text-secondary)] shrink-0">Grouping…</span>
          </div>
        </div>
      )}

      {/* Empty / loading states */}
      {!currentFolder && (
        <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-disabled)] text-xs gap-2 px-4 text-center">
          <FolderIcon size={32} />
          <span>Open a folder containing PDB or CIF files</span>
        </div>
      )}
      {currentFolder && isScanning && (
        <div className="flex items-center justify-center h-20 text-xs text-[var(--color-text-secondary)]">Scanning…</div>
      )}
      {currentFolder && !isScanning && files.length === 0 && (
        <div className="flex items-center justify-center h-20 text-xs text-[var(--color-text-secondary)] px-4 text-center">
          No {APP_DEFAULTS.SUPPORTED_FORMATS.join(', ')} files found
        </div>
      )}

      {/* File list — search / tree / groups view */}
      {currentFolder && !isScanning && files.length > 0 && (
        searchResults
          ? (
            <div className="flex-1 overflow-y-auto">
              {searchResults.shown.length === 0 && (
                <div className="flex items-center justify-center h-20 text-xs text-[var(--color-text-disabled)] px-4 text-center">
                  No files match "{fileSearchInput}"
                </div>
              )}
              {searchResults.shown.map(file => (
                <FileRow
                  key={file.path}
                  file={file}
                  isActive={file.path === activeFile}
                  indent={0}
                  onClick={(e) => handleFileClick(file, e)}
                />
              ))}
            </div>
          )
          : viewMode === 'groups' && hasGroups
            ? <FileTree viewerRef={viewerRef} />
            : (
              <div className="flex-1 overflow-y-auto">
                {dirTree.files.slice(0, FILE_LIMIT).map(file => (
                  <FileRow
                    key={file.path}
                    file={file}
                    isActive={file.path === activeFile}
                    indent={0}
                    onClick={(e) => handleFileClick(file, e)}
                  />
                ))}
                {dirTree.subdirs.map(dir => (
                  <DirNodeView
                    key={dir.relPath}
                    node={dir}
                    depth={0}
                    expanded={expanded}
                    activeFile={activeFile}
                    onToggle={toggleDir}
                    onFileClick={handleFileClick}
                    fileLimit={FILE_LIMIT}
                  />
                ))}
              </div>
            )
      )}

      {/* Status bar */}
      {currentFolder && !isScanning && files.length > 0 && (
        <div className="px-2 py-1 text-xs text-[var(--color-text-secondary)] border-t border-[var(--color-border)] shrink-0 flex items-center gap-2">
          {searchResults ? (
            <span>
              {searchResults.total === 0
                ? 'No matches'
                : searchResults.total > FILE_LIMIT
                  ? `${FILE_LIMIT} of ${searchResults.total} matches`
                  : `${searchResults.total} match${searchResults.total !== 1 ? 'es' : ''}`}
            </span>
          ) : (
            <>
              <span>
                {files.length > FILE_LIMIT
                  ? `${FILE_LIMIT} of ${files.length} files — search to find more`
                  : `${files.length} file${files.length !== 1 ? 's' : ''}`}
              </span>
              {hasGroups && !isGrouping && (
                <span className="opacity-60">· {groups.length} group{groups.length !== 1 ? 's' : ''}</span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Directory node (recursive) ────────────────────────────────────────────────

function DirNodeView({
  node, depth, expanded, activeFile, onToggle, onFileClick, fileLimit,
}: {
  node: DirNode
  depth: number
  expanded: Set<string>
  activeFile: string | null
  onToggle: (relPath: string) => void
  onFileClick: (f: FileInfo, e: React.MouseEvent) => void
  fileLimit: number
}) {
  const isOpen = expanded.has(node.relPath)
  const totalFiles = countFiles(node)
  const shownFiles = node.files.slice(0, fileLimit)
  const hiddenCount = node.files.length - shownFiles.length

  return (
    <div>
      <button
        onClick={() => onToggle(node.relPath)}
        className="w-full text-left flex items-center gap-1.5 px-2 py-1 hover:bg-[var(--color-secondary-bg)] transition-colors"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <span className="text-[10px] w-3 shrink-0 text-[var(--color-text-disabled)]">
          {isOpen ? '▼' : '▶'}
        </span>
        <FolderIcon size={12} className="shrink-0 text-[var(--color-text-secondary)]" />
        <span className="text-xs text-[var(--color-text-primary)] truncate flex-1">{node.name}</span>
        <span className="text-[10px] text-[var(--color-text-disabled)] shrink-0">{totalFiles}</span>
      </button>

      {isOpen && (
        <>
          {shownFiles.map(f => (
            <FileRow
              key={f.path}
              file={f}
              isActive={f.path === activeFile}
              indent={depth + 1}
              onClick={(e) => onFileClick(f, e)}
            />
          ))}
          {hiddenCount > 0 && (
            <div
              className="text-[10px] text-[var(--color-text-disabled)] py-1 italic"
              style={{ paddingLeft: `${8 + (depth + 1) * 12}px` }}
            >
              {hiddenCount} more — use search to find
            </div>
          )}
          {node.subdirs.map(sub => (
            <DirNodeView
              key={sub.relPath}
              node={sub}
              depth={depth + 1}
              expanded={expanded}
              activeFile={activeFile}
              onToggle={onToggle}
              onFileClick={onFileClick}
              fileLimit={fileLimit}
            />
          ))}
        </>
      )}
    </div>
  )
}

function countFiles(node: DirNode): number {
  return node.files.length + node.subdirs.reduce((n, d) => n + countFiles(d), 0)
}

// ── File row ──────────────────────────────────────────────────────────────────

function FileRow({
  file, isActive, indent, onClick,
}: {
  file: FileInfo
  isActive: boolean
  indent: number
  onClick: (e: React.MouseEvent) => void
}) {
  const isLarge = file.size > APP_DEFAULTS.MAX_FILE_SIZE_WARNING

  // Optional filter dimming — only when the toggle is on and rules are set
  const { showFilteredInBrowser, rules, passesFilters } = useFilterStore()
  const metrics = useMetricsStore(s => s.rows.find(r => r.filePath === file.path)?.metrics)
  const isFilteredOut = showFilteredInBrowser
    && rules.some(r => r.type === 'numeric' ? !!r.metric : !!r.residues?.trim())
    && metrics !== undefined
    && !passesFilters(metrics, file.path)

  return (
    <button
      onClick={onClick}
      title="Click to load · Ctrl+click to overlay as comparison"
      className={`w-full text-left flex items-center justify-between gap-2 py-1 pr-2 hover:bg-[var(--color-secondary-bg)] transition-colors ${isActive ? 'bg-[var(--color-accent)]/15 font-medium' : ''}`}
      style={{ paddingLeft: `${8 + indent * 12}px`, opacity: isFilteredOut ? 0.35 : 1 }}
    >
      <span className={`text-xs truncate flex-1 min-w-0 flex items-center gap-1 ${isFilteredOut ? 'text-[var(--color-text-disabled)]' : 'text-[var(--color-text-primary)]'}`}>
        <FileIcon />
        {file.name}
      </span>
      <span
        className={`text-[10px] shrink-0 ${isLarge ? 'text-amber-500' : 'text-[var(--color-text-disabled)]'}`}
        title={isLarge ? 'Large file — may be slow to load' : undefined}
      >
        {formatFileSize(file.size)}
      </span>
    </button>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function FolderIcon({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function FileIcon({ className = '' }: { className?: string }) {
  return (
    <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`inline shrink-0 opacity-60 ${className}`}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}


function RefreshIcon({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={spinning ? 'animate-spin' : ''}>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  )
}
