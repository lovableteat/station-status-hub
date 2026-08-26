import * as React from "react"

export const MOBILE_BREAKPOINT = 768
export const COMPACT_LAYOUT_BREAKPOINT = 1024

export const RESPONSIVE_BREAKPOINTS = {
  sm: 640,
  md: MOBILE_BREAKPOINT,
  lg: COMPACT_LAYOUT_BREAKPOINT,
  xl: 1280,
} as const

export type ResponsiveBreakpoint = keyof typeof RESPONSIVE_BREAKPOINTS

export function useMediaQuery(query: string, serverFallback = false) {
  const [matches, setMatches] = React.useState(() =>
    typeof window === "undefined" ? serverFallback : window.matchMedia(query).matches
  )

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
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
}

export function useIsCompactLayout() {
  return useMediaQuery(`(max-width: ${COMPACT_LAYOUT_BREAKPOINT - 1}px)`)
}

export function useMinWidth(
  breakpoint: ResponsiveBreakpoint,
  serverFallback = true
) {
  return useMediaQuery(
    `(min-width: ${RESPONSIVE_BREAKPOINTS[breakpoint]}px)`,
    serverFallback
  )
}

export function useIsDesktopLayout() {
  return useMinWidth("lg")
}

export function useIsWideLayout() {
  return useMinWidth("xl")
}
