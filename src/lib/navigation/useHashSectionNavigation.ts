import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export function useHashSectionNavigation(ready: boolean) {
  const { hash } = useLocation()

  useEffect(() => {
    if (!ready || !hash) return

    let sectionId: string
    try {
      sectionId = decodeURIComponent(hash.slice(1))
    } catch {
      return
    }

    const section = document.getElementById(sectionId)
    if (!section) return

    section.scrollIntoView({ behavior: 'smooth', block: 'start' })
    section.focus({ preventScroll: true })
  }, [hash, ready])
}
