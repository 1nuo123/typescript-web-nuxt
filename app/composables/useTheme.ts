import type { ResolvedTheme, ThemePreference } from '~/types/app'

const isThemePreference = (value: string | null): value is ThemePreference => {
  return value === 'light' || value === 'dark' || value === 'system'
}

const resolveTheme = (theme: ThemePreference): ResolvedTheme => {
  if (theme !== 'system') {
    return theme
  }

  if (import.meta.client) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }

  return 'light'
}

const readInitialResolvedTheme = (): ResolvedTheme => {
  if (!import.meta.client) {
    return 'light'
  }

  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export const useTheme = () => {
  const appStore = useAppStore()
  const resolvedTheme = useState<ResolvedTheme>(
    'resolved-theme',
    readInitialResolvedTheme,
  )
  let removeSystemThemeListener: (() => void) | undefined

  const applyTheme = (theme: ThemePreference) => {
    const resolved = resolveTheme(theme)
    resolvedTheme.value = resolved

    if (import.meta.client) {
      document.documentElement.dataset.theme = resolved
      document.documentElement.style.colorScheme = resolved
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    }
  }

  const setTheme = (theme: ThemePreference) => {
    appStore.setTheme(theme)
    applyTheme(theme)
  }

  const initializeTheme = () => {
    if (import.meta.server) {
      return
    }

    onMounted(() => {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY)

      if (isThemePreference(savedTheme)) {
        appStore.setTheme(savedTheme)
      } else {
        appStore.setTheme('system')
      }

      applyTheme(appStore.theme)

      const media = window.matchMedia('(prefers-color-scheme: dark)')
      const syncSystemTheme = () => {
        if (appStore.theme === 'system') {
          applyTheme('system')
        }
      }

      media.addEventListener('change', syncSystemTheme)

      removeSystemThemeListener = () => {
        media.removeEventListener('change', syncSystemTheme)
      }
    })

    onBeforeUnmount(() => {
      removeSystemThemeListener?.()
    })
  }

  return {
    preference: computed(() => appStore.theme),
    resolvedTheme: readonly(resolvedTheme),
    setTheme,
    initializeTheme,
  }
}
