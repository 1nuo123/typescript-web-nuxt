export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const

export type BreakpointName = keyof typeof BREAKPOINTS

export const mediaMaxWidth = (breakpoint: BreakpointName) =>
  `(max-width: ${BREAKPOINTS[breakpoint] - 1}px)`
