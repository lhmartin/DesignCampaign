import { useState, useEffect } from 'react'

/** Tracks whether the <html> element has the `dark` class, updated reactively. */
export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  )
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark'))
    )
    obs.observe(document.documentElement, { attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return isDark
}
