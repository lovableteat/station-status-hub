import * as React from "react"

const MOBILE_BREAKPOINT = 768
const COMPACT_LAYOUT_BREAKPOINT = 1024

function useMediaQuery(query: string) {
  const [matches, setMatches] = React.useState(false)

  React.useEffect(() => {
    const mediaQuery = window.matchMedia(query)
    const onChange = () => setMatches(mediaQuery.matches)
    mediaQuery.addEventListener("change", onChange)
    onChange()
    return () => mediaQuery.removeEventListener("change", onChange)
  }, [query])

  return matches
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}

export function useIsCompactLayout() {
  return useMediaQuery(`(max-width: ${COMPACT_LAYOUT_BREAKPOINT - 1}px)`)
}
