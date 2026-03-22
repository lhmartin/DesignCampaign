import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { RepresentationStyle, ColorScheme } from '@/components/viewer/ViewerControls'

/**
 * Persistent viewer settings.
 *
 * Persisted: colorScheme, style, cameraMode, viewerBg, spinning, spinSpeed.
 * Ephemeral:  requestedFilePath (transient trigger — never written to localStorage).
 */
interface ViewerPrefsStore {
  colorScheme:       ColorScheme
  style:             RepresentationStyle
  cameraMode:        'perspective' | 'orthographic'
  viewerBg:          'dark' | 'light'
  spinning:          boolean
  spinSpeed:         number
  requestedFilePath: string | null

  setColorScheme:  (s: ColorScheme)                    => void
  setStyle:        (s: RepresentationStyle)            => void
  setCameraMode:   (m: 'perspective' | 'orthographic') => void
  setViewerBg:     (b: 'dark' | 'light')               => void
  setSpinning:     (v: boolean)                        => void
  setSpinSpeed:    (v: number)                         => void
  requestLoadFile: (path: string | null)               => void
}

export const useViewerPrefsStore = create<ViewerPrefsStore>()(
  persist(
    (set) => ({
      colorScheme:       'chain-id',
      style:             'cartoon',
      cameraMode:        'perspective',
      viewerBg:          'dark',
      spinning:          false,
      spinSpeed:         0.3,
      requestedFilePath: null,

      setColorScheme:  (s)    => set({ colorScheme: s }),
      setStyle:        (s)    => set({ style: s }),
      setCameraMode:   (m)    => set({ cameraMode: m }),
      setViewerBg:     (b)    => set({ viewerBg: b }),
      setSpinning:     (v)    => set({ spinning: v }),
      setSpinSpeed:    (v)    => set({ spinSpeed: v }),
      requestLoadFile: (path) => set({ requestedFilePath: path }),
    }),
    {
      name: 'dc-viewer-prefs',
      partialize: (s) => ({
        colorScheme: s.colorScheme,
        style:       s.style,
        cameraMode:  s.cameraMode,
        viewerBg:    s.viewerBg,
        spinning:    s.spinning,
        spinSpeed:   s.spinSpeed,
      }),
    },
  ),
)
