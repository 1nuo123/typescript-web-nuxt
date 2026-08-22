import { nextTick, onMounted, onScopeDispose, watch, type Ref } from 'vue'

export const CODEX_COMPOSER_DESKTOP_MAX_HEIGHT_PX = 240
export const CODEX_COMPOSER_MOBILE_VIEWPORT_RATIO = 0.35

const CODEX_COMPOSER_MIN_HEIGHT_PX = 80
const MOBILE_VIEWPORT_MAX_WIDTH_PX = 767

/** 编辑器一次调整前后的尺寸，供父级在布局变化前后恢复阅读锚点。 */
export interface CodexComposerViewportHeightChange {
  previousHeight: number
  nextHeight: number
}

interface CodexComposerViewportOptions {
  textarea: Ref<HTMLTextAreaElement | null>
  content: Ref<string>
  onBeforeHeightChange?: (change: CodexComposerViewportHeightChange) => void
  onHeightChange?: (change: CodexComposerViewportHeightChange) => void
}

/**
 * 协调编辑器内容、visual viewport 和软键盘。尺寸只影响 textarea 本身；
 * 时间线锚点属于父级滚动控制器，因而通过显式回调交由父级恢复。
 */
export const useCodexComposerViewport = (
  options: CodexComposerViewportOptions,
) => {
  const isMobileViewport = (): boolean =>
    import.meta.client && window.innerWidth <= MOBILE_VIEWPORT_MAX_WIDTH_PX

  const getViewportHeight = (): number =>
    import.meta.client
      ? (window.visualViewport?.height ?? window.innerHeight)
      : CODEX_COMPOSER_DESKTOP_MAX_HEIGHT_PX

  const getMaximumHeight = (): number =>
    isMobileViewport()
      ? Math.max(
          1,
          Math.floor(
            getViewportHeight() * CODEX_COMPOSER_MOBILE_VIEWPORT_RATIO,
          ),
        )
      : CODEX_COMPOSER_DESKTOP_MAX_HEIGHT_PX

  const resizeTextarea = (): void => {
    const textarea = options.textarea.value
    if (!textarea) return

    const maximumHeight = getMaximumHeight()
    const previousHeight = textarea.offsetHeight
    textarea.style.height = 'auto'
    const nextHeight = Math.min(
      Math.max(
        textarea.scrollHeight,
        Math.min(CODEX_COMPOSER_MIN_HEIGHT_PX, maximumHeight),
      ),
      maximumHeight,
    )
    const change = { previousHeight, nextHeight }
    if (Math.abs(previousHeight - nextHeight) > 0.5)
      options.onBeforeHeightChange?.(change)

    textarea.style.maxHeight = `${maximumHeight}px`
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY =
      textarea.scrollHeight > nextHeight ? 'auto' : 'hidden'

    if (Math.abs(previousHeight - nextHeight) > 0.5)
      options.onHeightChange?.(change)
  }

  const resizeAfterDomCommit = (): void => {
    void nextTick(resizeTextarea)
  }

  const visualViewport = import.meta.client ? window.visualViewport : null
  const listenForViewportChanges = (): void => {
    window.addEventListener('resize', resizeAfterDomCommit, { passive: true })
    visualViewport?.addEventListener('resize', resizeAfterDomCommit, {
      passive: true,
    })
    visualViewport?.addEventListener('scroll', resizeAfterDomCommit, {
      passive: true,
    })
  }

  const stopListeningForViewportChanges = (): void => {
    window.removeEventListener('resize', resizeAfterDomCommit)
    visualViewport?.removeEventListener('resize', resizeAfterDomCommit)
    visualViewport?.removeEventListener('scroll', resizeAfterDomCommit)
  }

  watch([options.textarea, options.content], resizeAfterDomCommit, {
    flush: 'post',
  })
  onMounted(() => {
    listenForViewportChanges()
    resizeAfterDomCommit()
  })
  onScopeDispose(stopListeningForViewportChanges)

  return { resizeTextarea }
}
