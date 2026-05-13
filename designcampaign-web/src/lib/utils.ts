import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format file size in human-readable form */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Get file format from extension */
export function getFileFormat(filePath: string): 'pdb' | 'mmcif' {
  const lower = filePath.toLowerCase()
  return lower.endsWith('.cif') || lower.endsWith('.mmcif') ? 'mmcif' : 'pdb'
}

/** Extract filename (with extension) from a posix or windows path */
export function getFileName(filePath: string): string {
  return filePath.split('/').pop()?.split('\\').pop() ?? filePath
}

/** Extract filename stem (no extension) */
export function getFileStem(filePath: string): string {
  return getFileName(filePath).replace(/\.[^.]+$/, '')
}

/** Extract filename extension (without the dot), uppercased. Returns '' if none. */
export function getFileExt(filePath: string): string {
  const name = getFileName(filePath)
  const m = /\.([^.]+)$/.exec(name)
  return m ? m[1].toUpperCase() : ''
}

/** Trigger a browser download for a string payload. */
export function downloadBlob(content: string, filename: string, mimeType = 'text/plain'): void {
  const blob = new Blob([content], { type: mimeType })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
