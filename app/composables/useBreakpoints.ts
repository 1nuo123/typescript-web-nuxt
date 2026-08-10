import { BREAKPOINTS } from '~/utils/breakpoints'

export const useBreakpoints = () => {
  const width = useState('viewport-width', () => 0)

  if (import.meta.client) {
    onMounted(() => {
      const setWidth = () => {
        width.value = window.innerWidth
      }

      setWidth()
      window.addEventListener('resize', setWidth, { passive: true })

      onBeforeUnmount(() => {
        window.removeEventListener('resize', setWidth)
      })
    })
  }

  return {
    width: readonly(width),
    isMobile: computed(() => width.value > 0 && width.value < BREAKPOINTS.md),
    isTablet: computed(
      () => width.value >= BREAKPOINTS.md && width.value < BREAKPOINTS.lg,
    ),
    isDesktop: computed(() => width.value >= BREAKPOINTS.lg),
    isNavigationModal: computed(
      () => width.value > 0 && width.value < BREAKPOINTS.lg,
    ),
  }
}
