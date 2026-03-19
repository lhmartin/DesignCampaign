import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

type PluginUIContext = import('molstar/lib/mol-plugin-ui/context').PluginUIContext

export function useMolstar(containerRef: RefObject<HTMLDivElement | null>) {
  const [plugin, setPlugin] = useState<PluginUIContext | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pluginRef = useRef<PluginUIContext | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    let disposed = false

    const init = async () => {
      try {
        const { createPluginUI } = await import('molstar/lib/mol-plugin-ui')
        const { renderReact18 } = await import('molstar/lib/mol-plugin-ui/react18')
        const { DefaultPluginUISpec } = await import('molstar/lib/mol-plugin-ui/spec')

        const p = await createPluginUI({
          target: containerRef.current!,
          render: renderReact18,
          spec: {
            ...DefaultPluginUISpec(),
            layout: {
              initial: {
                isExpanded: false,
                showControls: false,
                regionState: {
                  top: 'hidden',
                  left: 'hidden',
                  right: 'hidden',
                  bottom: 'full',   // Enable built-in sequence viewer
                },
              },
            },
            canvas3d: {
              renderer: {
                // Deep navy-black: matches dark theme viewer bg
                backgroundColor: 0x040812 as unknown as import('molstar/lib/mol-util/color').Color,
              },
            },
          },
        })

        if (!disposed) {
          pluginRef.current = p
          setPlugin(p)
          // Register custom color themes (non-fatal)
          import('../themes/hydrophobicity-theme')
            .then(m => m.registerHydrophobicityTheme(p))
            .catch(console.warn)
          import('../themes/plddt-theme')
            .then(m => m.registerPlddtTheme(p))
            .catch(console.warn)
          import('../themes/interface-theme')
            .then(m => m.registerInterfaceTheme(p))
            .catch(console.warn)
          import('../themes/rmsd-deviation-theme')
            .then(m => m.registerRmsdDeviationTheme(p))
            .catch(console.warn)
        } else {
          p.dispose()
        }
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : 'Failed to initialize Mol*')
        }
      }
    }

    init()

    return () => {
      disposed = true
      if (pluginRef.current) {
        pluginRef.current.dispose()
        pluginRef.current = null
      }
      setPlugin(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { plugin, isLoading, error, setIsLoading }
}
