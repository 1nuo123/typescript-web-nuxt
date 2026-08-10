import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BREAKPOINTS, mediaMaxWidth } from '../../app/utils/breakpoints'

const breakpointManagedPaths = [
  '../../app/assets/css/main.css',
  '../../app/pages/index.vue',
  '../../app/components/layout/AppHeader.vue',
  '../../app/components/layout/AppSidebar.vue',
  '../../app/components/layout/PageContainer.vue',
].map((path) => fileURLToPath(new URL(path, import.meta.url)))
const legacyBreakpointPattern = /\b(560|680|720|960|1080)px\b/

describe('breakpoint contract', () => {
  it('keeps CSS and page media queries aligned to shared breakpoint values', () => {
    const mediaSources = breakpointManagedPaths
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n')

    expect(mediaMaxWidth('md')).toBe(`(max-width: ${BREAKPOINTS.md - 1}px)`)
    expect(mediaMaxWidth('lg')).toBe(`(max-width: ${BREAKPOINTS.lg - 1}px)`)
    expect(mediaSources).toContain('max-md:')
    expect(mediaSources).toContain('max-lg:')
    expect(mediaSources).not.toMatch(legacyBreakpointPattern)
  })
})
