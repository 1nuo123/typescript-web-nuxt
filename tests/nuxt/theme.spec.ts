import { afterEach, describe, expect, it, vi } from 'vitest'

describe('theme bootstrap', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
    delete document.documentElement.dataset.theme
    document.documentElement.style.colorScheme = ''
    clearNuxtState('resolved-theme')
    useAppStore().$reset()
  })

  it('publishes a hydration-safe bootstrap script', () => {
    expect(THEME_BOOTSTRAP_SCRIPT).toContain(THEME_STORAGE_KEY)
    expect(THEME_BOOTSTRAP_SCRIPT).toContain(
      'document.documentElement.dataset.theme=resolved',
    )
    expect(THEME_BOOTSTRAP_SCRIPT).toContain(
      'document.documentElement.style.colorScheme=resolved',
    )
  })

  it('reads the initial resolved theme from the html data attribute', () => {
    document.documentElement.dataset.theme = 'dark'

    const { resolvedTheme } = useTheme()

    expect(resolvedTheme.value).toBe('dark')
  })
})
