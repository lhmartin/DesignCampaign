import type { RefObject, MouseEvent } from 'react'
import type { FileInfo } from '@/types/electron'
import { useGroupStore, type StructureGroup } from '@/stores/group-store'
import { useFileStore } from '@/stores/file-store'
import { useProteinStore } from '@/stores/protein-store'
import { formatFileSize } from '@/lib/utils'
import type { MolstarViewerHandle } from '@/components/viewer/MolstarViewer'
import { APP_DEFAULTS } from '@/lib/constants/app'

interface FileTreeProps {
  viewerRef: RefObject<MolstarViewerHandle | null>
}

export function FileTree({ viewerRef }: FileTreeProps) {
  const { files, activeFile, setActiveFile } = useFileStore()
  const { setLoading } = useProteinStore()
  const { groups, ungrouped, toggleGroup } = useGroupStore()

  const fileMap = new Map(files.map(f => [f.path, f]))

  const handleFileClick = async (file: FileInfo, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      await viewerRef.current?.loadAsComparison(file.path)
      return
    }
    if (activeFile === file.path) return
    setActiveFile(file.path)
    setLoading(true)
    try { await viewerRef.current?.loadFromFile(file.path) }
    finally { setLoading(false) }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {groups.map(group => (
        <GroupSection
          key={group.id}
          group={group}
          fileMap={fileMap}
          activeFile={activeFile}
          onToggle={() => toggleGroup(group.id)}
          onFileClick={handleFileClick}
        />
      ))}

      {ungrouped.length > 0 && (
        <div>
          <div className="px-2 py-1 text-xs font-medium text-[var(--color-text-secondary)] bg-[var(--color-secondary-bg)] border-b border-[var(--color-border)] flex items-center gap-1">
            <span className="opacity-60">◆</span>
            <span>Ungrouped ({ungrouped.length})</span>
          </div>
          {ungrouped.map(path => {
            const f = fileMap.get(path)
            if (!f) return null
            return (
              <FileRow
                key={path}
                file={f}
                isActive={path === activeFile}
                onClick={(e) => handleFileClick(f, e)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function GroupSection({
  group,
  fileMap,
  activeFile,
  onToggle,
  onFileClick,
}: {
  group: StructureGroup
  fileMap: Map<string, FileInfo>
  activeFile: string | null
  onToggle: () => void
  onFileClick: (f: FileInfo, e: MouseEvent) => void
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full text-left px-2 py-1 text-xs font-medium text-[var(--color-text-secondary)] bg-[var(--color-secondary-bg)] hover:bg-[var(--color-border)] border-b border-[var(--color-border)] flex items-center gap-1.5 transition-colors"
      >
        <span className="text-[10px] w-3 shrink-0">{group.isExpanded ? '▼' : '▶'}</span>
        <span className="truncate flex-1 font-mono">{group.label}</span>
        <span className="shrink-0 opacity-60">{group.members.length}</span>
      </button>
      {group.isExpanded && group.members.map(path => {
        const f = fileMap.get(path)
        if (!f) return null
        return (
          <FileRow
            key={path}
            file={f}
            isActive={path === activeFile}
            onClick={(e) => onFileClick(f, e)}
            indent
          />
        )
      })}
    </div>
  )
}

function FileRow({
  file,
  isActive,
  onClick,
  indent = false,
}: {
  file: FileInfo
  isActive: boolean
  onClick: (e: MouseEvent) => void
  indent?: boolean
}) {
  const isLarge = file.size > APP_DEFAULTS.MAX_FILE_SIZE_WARNING

  return (
    <button
      onClick={onClick}
      title="Click to load · Ctrl+click to overlay as comparison"
      className={`w-full text-left flex items-center justify-between gap-2 hover:bg-[var(--color-secondary-bg)] transition-colors ${indent ? 'pl-5 pr-2' : 'px-2'} py-1.5 ${isActive ? 'bg-[var(--color-accent)]/15 font-medium' : ''}`}
    >
      <span className="text-xs text-[var(--color-text-primary)] truncate flex-1 min-w-0">
        <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="inline mr-1.5 opacity-50 shrink-0">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        {file.name}
      </span>
      <span className={`text-xs shrink-0 ${isLarge ? 'text-amber-500' : 'text-[var(--color-text-disabled)]'}`}>
        {formatFileSize(file.size)}
      </span>
    </button>
  )
}
