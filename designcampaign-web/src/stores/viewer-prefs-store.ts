import { create } from 'zustand'
import type { ColorScheme } from '@/components/viewer/ViewerControls'

/**
 * Lightweight store for viewer state that other panels need to read/write.
 *
 * - `colorScheme` / `setColorScheme` — lifted from MolstarViewer local state so
 *   external panels (e.g. SelectionPanel) can switch the active colour scheme.
 * - `requestedFilePath` / `requestLoadFile` — lets any panel trigger a file load
 *   in the viewer without prop drilling a viewerRef. Pass `null` to clear.
 *
 * NOTE: Assumes a single MolstarViewer instance in the app.
 */

interface ViewerPrefsStore {
  colorScheme:       ColorScheme
  requestedFilePath: string | null

  setColorScheme:  (s: ColorScheme)       => void
  requestLoadFile: (path: string | null)  => void
}

export const useViewerPrefsStore = create<ViewerPrefsStore>((set) => ({
  colorScheme:       'chain-id',
  requestedFilePath: null,

  setColorScheme:  (s)    => set({ colorScheme: s }),
  requestLoadFile: (path) => set({ requestedFilePath: path }),
}))
