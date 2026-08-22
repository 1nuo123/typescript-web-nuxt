import { computed, onScopeDispose, readonly, ref } from 'vue'
import {
  CodexTimelineScrollState,
  type CodexTimelineScrollAnchor,
} from '../types/codex-timeline-scroll'
import {
  ClientPerformanceMetric,
  ClientPerformanceObservation,
  type ClientPerformanceDiagnosticMeasurement,
} from '../types/app'

const FOLLOWING_BOTTOM_TOLERANCE_PX = 8
const TIMELINE_ESTIMATED_ROW_HEIGHT_PX = 112
const ITEM_SELECTOR = '[data-codex-item-id]'

export const isUpwardTimelineKey = (key: string): boolean =>
  ['ArrowUp', 'PageUp', 'Home'].includes(key)

export const isUpwardTimelineWheel = (deltaY: number): boolean => deltaY < 0

/** 根据实际可视高度计算虚拟列表预读项数，移动端预读一个视口，桌面端预读两个视口。 */
export const getCodexTimelineOverscan = (
  viewportHeight: number,
  isMobile: boolean,
): number => {
  const viewportItemCount = Math.max(
    1,
    Math.ceil(Math.max(viewportHeight, 1) / TIMELINE_ESTIMATED_ROW_HEIGHT_PX),
  )
  return viewportItemCount * (isMobile ? 1 : 2)
}

/** 减少动态效果时必须使用瞬时定位，避免“跳到最新”产生不必要的视觉运动。 */
export const shouldUseSmoothTimelineScroll = (
  distance: number,
  viewportHeight: number,
  prefersReducedMotion: boolean,
): boolean => !prefersReducedMotion && distance <= viewportHeight * 1.5

interface CodexTimelineScrollControllerOptions {
  initialFollowing: boolean
  onViewportResize?: (height: number) => void
  persistPosition: (following: boolean, scrollTop: number) => void
  recordPerformance?: (
    measurement: ClientPerformanceDiagnosticMeasurement,
  ) => void
}

/**
 * 管理时间线的跟随、脱离和锚点恢复。所有测量写入同一个 RAF，避免
 * ResizeObserver、虚拟列表与用户滚动同时竞争 scrollTop。
 */
export const useCodexTimelineScrollController = (
  options: CodexTimelineScrollControllerOptions,
) => {
  const state = ref(
    options.initialFollowing
      ? CodexTimelineScrollState.Following
      : CodexTimelineScrollState.Detached,
  )
  const container = ref<HTMLElement | null>(null)
  const bottomSentinel = ref<HTMLElement | null>(null)
  let intersectionObserver: IntersectionObserver | null = null
  let resizeObserver: ResizeObserver | null = null
  let animationFrame: number | null = null
  let touchStartY: number | null = null
  let pointerStartY: number | null = null
  let anchor: CodexTimelineScrollAnchor | null = null

  const isFollowing = computed(
    () => state.value === CodexTimelineScrollState.Following,
  )

  const recordPerformance = (
    metric: ClientPerformanceMetric,
    observation: ClientPerformanceObservation,
    value: number,
  ): void => options.recordPerformance?.({ metric, observation, value })

  const persist = (): void => {
    const element = container.value
    if (element) options.persistPosition(isFollowing.value, element.scrollTop)
  }

  const detach = (): void => {
    if (!isFollowing.value) return
    captureAnchor()
    state.value = CodexTimelineScrollState.Detached
    recordPerformance(
      ClientPerformanceMetric.ScrollStateTransition,
      ClientPerformanceObservation.FollowingToDetached,
      1,
    )
    persist()
  }

  const follow = (): void => {
    const previousState = state.value
    state.value = CodexTimelineScrollState.Following
    anchor = null
    if (previousState === CodexTimelineScrollState.Detached) {
      recordPerformance(
        ClientPerformanceMetric.ScrollStateTransition,
        ClientPerformanceObservation.DetachedToFollowing,
        1,
      )
    }
    if (previousState === CodexTimelineScrollState.Restoring) {
      recordPerformance(
        ClientPerformanceMetric.ScrollStateTransition,
        ClientPerformanceObservation.RestoringToFollowing,
        1,
      )
    }
    persist()
  }

  const findAnchor = (): CodexTimelineScrollAnchor | null => {
    const element = container.value
    if (!element) return null
    const containerTop = element.getBoundingClientRect().top
    const items = element.querySelectorAll<HTMLElement>(ITEM_SELECTOR)
    for (const item of items) {
      const rect = item.getBoundingClientRect()
      if (rect.bottom > containerTop) {
        const itemId = item.dataset.codexItemId
        if (itemId) return { itemId, offset: rect.top - containerTop }
      }
    }
    return null
  }

  const captureAnchor = (): CodexTimelineScrollAnchor | null => {
    anchor = findAnchor()
    return anchor
  }

  const restoreAnchor = (): void => {
    const element = container.value
    if (!element || !anchor) return
    const escapedItemId =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(anchor.itemId)
        : anchor.itemId.replaceAll('"', '\\"')
    const item = element.querySelector<HTMLElement>(
      `[data-codex-item-id="${escapedItemId}"]`,
    )
    if (!item) return
    const delta =
      item.getBoundingClientRect().top -
      element.getBoundingClientRect().top -
      anchor.offset
    if (Math.abs(delta) > 0.5) {
      element.scrollTop += delta
      recordPerformance(
        ClientPerformanceMetric.ScrollAnchorCorrectionPixels,
        ClientPerformanceObservation.AnchorCorrected,
        Math.abs(delta),
      )
    }
  }

  /**
   * 从跨页面返回时恢复用户显式阅读位置。该路径必须转为 detached，
   * 否则下一次测量会把用户重新推到最新消息。
   */
  const restoreReadingAnchor = (
    nextAnchor: CodexTimelineScrollAnchor,
  ): void => {
    anchor = nextAnchor
    state.value = CodexTimelineScrollState.Restoring
    restoreAnchor()
    state.value = CodexTimelineScrollState.Detached
    persist()
  }

  const scrollToLatest = (): void => {
    const element = container.value
    if (!element) return
    follow()
    const distance = Math.abs(
      element.scrollHeight - element.clientHeight - element.scrollTop,
    )
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    element.scrollTo({
      top: element.scrollHeight,
      behavior: shouldUseSmoothTimelineScroll(
        distance,
        element.clientHeight,
        prefersReducedMotion,
      )
        ? 'smooth'
        : 'auto',
    })
    persist()
  }

  const flushCommit = (): void => {
    animationFrame = null
    const element = container.value
    if (!element) return
    if (isFollowing.value) {
      element.scrollTop = Math.max(
        0,
        element.scrollHeight - element.clientHeight,
      )
    } else {
      state.value = CodexTimelineScrollState.Restoring
      restoreAnchor()
      state.value = CodexTimelineScrollState.Detached
    }
    persist()
  }

  const onCommit = (): void => {
    if (animationFrame !== null) return
    animationFrame = requestAnimationFrame(flushCommit)
  }

  const onScroll = (): void => {
    const element = container.value
    if (
      element &&
      !isFollowing.value &&
      element.scrollHeight - element.scrollTop - element.clientHeight <=
        FOLLOWING_BOTTOM_TOLERANCE_PX
    ) {
      follow()
      return
    }
    persist()
  }

  const onWheel = (event: WheelEvent): void => {
    if (isUpwardTimelineWheel(event.deltaY)) detach()
  }

  const onTouchStart = (event: TouchEvent): void => {
    touchStartY = event.touches.item(0)?.clientY ?? null
  }

  const onTouchMove = (event: TouchEvent): void => {
    const currentY = event.touches.item(0)?.clientY
    if (
      touchStartY !== null &&
      currentY !== undefined &&
      currentY < touchStartY
    )
      detach()
    touchStartY = currentY ?? null
  }

  const onPointerDown = (event: PointerEvent): void => {
    pointerStartY = event.clientY
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (pointerStartY !== null && event.clientY < pointerStartY) detach()
    pointerStartY = event.clientY
  }

  const onKeydown = (event: KeyboardEvent): void => {
    if (isUpwardTimelineKey(event.key)) detach()
  }

  const attach = (
    nextContainer: HTMLElement,
    nextBottomSentinel: HTMLElement,
  ): void => {
    dispose()
    container.value = nextContainer
    bottomSentinel.value = nextBottomSentinel
    options.onViewportResize?.(nextContainer.clientHeight)
    if (typeof IntersectionObserver !== 'undefined') {
      intersectionObserver = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) follow()
        },
        { root: nextContainer, threshold: 1 },
      )
      intersectionObserver.observe(nextBottomSentinel)
    }
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        options.onViewportResize?.(
          entries[0]?.contentRect.height ?? nextContainer.clientHeight,
        )
        onCommit()
      })
      resizeObserver.observe(nextContainer)
    }
  }

  const dispose = (): void => {
    intersectionObserver?.disconnect()
    resizeObserver?.disconnect()
    intersectionObserver = null
    resizeObserver = null
    if (animationFrame !== null) cancelAnimationFrame(animationFrame)
    animationFrame = null
    touchStartY = null
    pointerStartY = null
  }

  onScopeDispose(dispose)

  return {
    bottomSentinel,
    container,
    isFollowing,
    onCommit,
    onKeydown,
    onPointerDown,
    onPointerMove,
    onScroll,
    onTouchMove,
    onTouchStart,
    onWheel,
    restoreAnchor,
    restoreReadingAnchor,
    scrollToLatest,
    state: readonly(state),
    attach,
    captureAnchor,
    dispose,
  }
}
