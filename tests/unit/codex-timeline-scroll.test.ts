// @vitest-environment happy-dom

import { effectScope, type EffectScope } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getCodexTimelineOverscan,
  isUpwardTimelineKey,
  isUpwardTimelineWheel,
  shouldUseSmoothTimelineScroll,
  useCodexTimelineScrollController,
} from '../../app/composables/useCodexTimelineScrollController'
import type { ClientPerformanceDiagnosticMeasurement } from '../../app/types/app'
import { CodexTimelineScrollState } from '../../app/types/codex-timeline-scroll'

interface TimelineContainerFixture {
  element: HTMLElement
  lastScrollBehavior: () => ScrollBehavior | undefined
  setMetrics: (metrics: {
    scrollHeight?: number
    clientHeight?: number
    scrollTop?: number
  }) => void
}

interface TimelineControllerFixture {
  controller: ReturnType<typeof useCodexTimelineScrollController>
  container: TimelineContainerFixture
  scope: EffectScope
  performanceMeasurements: ClientPerformanceDiagnosticMeasurement[]
}

const createTimelineContainer = (): TimelineContainerFixture => {
  const element = document.createElement('div')
  let scrollHeight = 1_000
  let clientHeight = 500
  let scrollTop = 500
  let lastScrollBehavior: ScrollBehavior | undefined
  Object.defineProperties(element, {
    scrollHeight: { get: () => scrollHeight },
    clientHeight: { get: () => clientHeight },
    scrollTop: {
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = Math.max(0, Math.min(value, scrollHeight - clientHeight))
      },
    },
  })
  element.getBoundingClientRect = () => ({ top: 0, bottom: 0 }) as DOMRect
  element.scrollTo = ({ top, behavior }: ScrollToOptions) => {
    lastScrollBehavior = behavior
    element.scrollTop = top ?? element.scrollTop
  }
  return {
    element,
    lastScrollBehavior: () => lastScrollBehavior,
    setMetrics: (metrics) => {
      if (metrics.scrollHeight !== undefined)
        scrollHeight = metrics.scrollHeight
      if (metrics.clientHeight !== undefined)
        clientHeight = metrics.clientHeight
      if (metrics.scrollTop !== undefined) scrollTop = metrics.scrollTop
    },
  }
}

const createControllerFixture = (
  initialFollowing = true,
): TimelineControllerFixture => {
  const container = createTimelineContainer()
  const sentinel = document.createElement('div')
  const scope = effectScope()
  const performanceMeasurements: ClientPerformanceDiagnosticMeasurement[] = []
  const controller = scope.run(() =>
    useCodexTimelineScrollController({
      initialFollowing,
      persistPosition: () => undefined,
      recordPerformance: (measurement) =>
        performanceMeasurements.push(measurement),
    }),
  )!
  controller.attach(container.element, sentinel)
  return { controller, container, scope, performanceMeasurements }
}

const flushAnimationFrame = async (): Promise<void> => {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Codex timeline scroll intent', () => {
  it('recognizes only upward navigation keys as detach intent', () => {
    expect(isUpwardTimelineKey('PageUp')).toBe(true)
    expect(isUpwardTimelineKey('Home')).toBe(true)
    expect(isUpwardTimelineKey('ArrowDown')).toBe(false)
  })

  it('does not treat downward wheel motion as an upward detach gesture', () => {
    expect(isUpwardTimelineWheel(-1)).toBe(true)
    expect(isUpwardTimelineWheel(1)).toBe(false)
  })

  it('uses one mobile viewport and two desktop viewports for virtual overscan', () => {
    expect(getCodexTimelineOverscan(560, true)).toBe(5)
    expect(getCodexTimelineOverscan(560, false)).toBe(10)
    expect(getCodexTimelineOverscan(0, true)).toBe(1)
  })

  it('uses instant scrolling when reduced motion is preferred', () => {
    expect(shouldUseSmoothTimelineScroll(200, 500, false)).toBe(true)
    expect(shouldUseSmoothTimelineScroll(800, 500, false)).toBe(false)
    expect(shouldUseSmoothTimelineScroll(200, 500, true)).toBe(false)
  })
})

describe('Codex timeline scroll controller', () => {
  it('scroll_controller_programmatic_measurement_does_not_detach', async () => {
    const fixture = createControllerFixture()
    fixture.container.setMetrics({
      scrollHeight: 1_200,
      clientHeight: 500,
      scrollTop: 140,
    })

    fixture.controller.onCommit()
    await flushAnimationFrame()

    expect(fixture.controller.state.value).toBe(
      CodexTimelineScrollState.Following,
    )
    expect(fixture.container.element.scrollTop).toBe(700)
    fixture.scope.stop()
  })

  it('scroll_controller_real_upward_gesture_detaches', () => {
    const fixture = createControllerFixture()

    fixture.controller.onWheel({ deltaY: -24 } as WheelEvent)

    expect(fixture.controller.state.value).toBe(
      CodexTimelineScrollState.Detached,
    )
    expect(fixture.performanceMeasurements).toContainEqual({
      metric: 'scroll_state_transition',
      observation: 'following_to_detached',
      value: 1,
    })
    fixture.scope.stop()
  })

  it('scroll_controller_return_to_bottom_resumes_following', () => {
    const fixture = createControllerFixture()
    fixture.controller.onKeydown({ key: 'PageUp' } as KeyboardEvent)
    fixture.container.setMetrics({ scrollTop: 500 })

    fixture.controller.onScroll()

    expect(fixture.controller.state.value).toBe(
      CodexTimelineScrollState.Following,
    )
    fixture.scope.stop()
  })

  it('returns to following when the bottom sentinel becomes visible', () => {
    let intersectionCallback: IntersectionObserverCallback | null = null

    class TestIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback
      }

      disconnect = vi.fn()
      observe = vi.fn()
    }

    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver)
    const fixture = createControllerFixture()
    fixture.controller.onWheel({ deltaY: -24 } as WheelEvent)

    intersectionCallback?.(
      [{ isIntersecting: true }] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    )

    expect(fixture.controller.state.value).toBe(
      CodexTimelineScrollState.Following,
    )
    fixture.scope.stop()
  })

  it('scroll_controller_stream_growth_keeps_bottom_anchor', async () => {
    const fixture = createControllerFixture()
    fixture.container.setMetrics({ scrollHeight: 1_360, scrollTop: 500 })

    fixture.controller.onCommit()
    await flushAnimationFrame()

    expect(fixture.controller.state.value).toBe(
      CodexTimelineScrollState.Following,
    )
    expect(fixture.container.element.scrollTop).toBe(860)
    fixture.scope.stop()
  })

  it('scroll_controller_height_change_preserves_visible_item', async () => {
    const fixture = createControllerFixture(false)
    fixture.container.setMetrics({ scrollHeight: 1_200, scrollTop: 500 })
    const item = document.createElement('article')
    item.dataset.codexItemId = 'item-1'
    fixture.container.element.append(item)
    let itemTop = 60
    item.getBoundingClientRect = () =>
      ({ top: itemTop, bottom: itemTop + 80 }) as DOMRect

    fixture.controller.captureAnchor()
    itemTop = 88
    fixture.controller.onCommit()
    await flushAnimationFrame()

    expect(fixture.controller.state.value).toBe(
      CodexTimelineScrollState.Detached,
    )
    expect(fixture.container.element.scrollTop).toBe(528)
    expect(fixture.performanceMeasurements).toContainEqual({
      metric: 'scroll_anchor_correction_pixels',
      observation: 'anchor_corrected',
      value: 28,
    })
    fixture.scope.stop()
  })

  it('preserves the first visible item when an older history page is prepended', async () => {
    const fixture = createControllerFixture(false)
    fixture.container.setMetrics({ scrollHeight: 1_200, scrollTop: 360 })
    const visibleItem = document.createElement('article')
    visibleItem.dataset.codexItemId = 'latest-visible-item'
    fixture.container.element.append(visibleItem)
    let visibleItemTop = 44
    visibleItem.getBoundingClientRect = () =>
      ({ top: visibleItemTop, bottom: visibleItemTop + 72 }) as DOMRect

    fixture.controller.captureAnchor()
    // 旧页 prepend 后，原可见项在内容坐标中下移 184px。
    visibleItemTop = 228
    fixture.container.setMetrics({ scrollHeight: 1_384 })
    fixture.controller.onCommit()
    await flushAnimationFrame()

    expect(fixture.container.element.scrollTop).toBe(544)
    expect(fixture.controller.state.value).toBe(
      CodexTimelineScrollState.Detached,
    )
    fixture.scope.stop()
  })

  it('scroll_controller_jump_latest_does_not_change_content_height', () => {
    const fixture = createControllerFixture(false)
    fixture.container.setMetrics({ scrollHeight: 1_200, scrollTop: 0 })
    const originalScrollHeight = fixture.container.element.scrollHeight

    fixture.controller.scrollToLatest()

    expect(fixture.container.element.scrollHeight).toBe(originalScrollHeight)
    expect(fixture.container.element.scrollTop).toBe(700)
    expect(fixture.controller.state.value).toBe(
      CodexTimelineScrollState.Following,
    )
    fixture.scope.stop()
  })

  it('uses an instant jump to latest when reduced motion is preferred', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    )
    const fixture = createControllerFixture(false)
    fixture.container.setMetrics({ scrollHeight: 1_200, scrollTop: 0 })

    fixture.controller.scrollToLatest()

    expect(fixture.container.lastScrollBehavior()).toBe('auto')
    fixture.scope.stop()
  })

  it('detaches for upward touch, pointer, and keyboard input', () => {
    const touchFixture = createControllerFixture()
    touchFixture.controller.onTouchStart({
      touches: { item: () => ({ clientY: 180 }) },
    } as unknown as TouchEvent)
    touchFixture.controller.onTouchMove({
      touches: { item: () => ({ clientY: 140 }) },
    } as unknown as TouchEvent)
    expect(touchFixture.controller.state.value).toBe(
      CodexTimelineScrollState.Detached,
    )
    touchFixture.scope.stop()

    const pointerFixture = createControllerFixture()
    pointerFixture.controller.onPointerDown({ clientY: 180 } as PointerEvent)
    pointerFixture.controller.onPointerMove({ clientY: 140 } as PointerEvent)
    expect(pointerFixture.controller.state.value).toBe(
      CodexTimelineScrollState.Detached,
    )
    pointerFixture.scope.stop()

    const keyFixture = createControllerFixture()
    keyFixture.controller.onKeydown({ key: 'PageUp' } as KeyboardEvent)
    expect(keyFixture.controller.state.value).toBe(
      CodexTimelineScrollState.Detached,
    )
    keyFixture.scope.stop()
  })

  it('disposes observers and a pending animation frame with the component scope', () => {
    const disconnectIntersectionObserver = vi.fn()
    const disconnectResizeObserver = vi.fn()
    const cancelAnimationFrame = vi.fn()

    class TestIntersectionObserver {
      disconnect = disconnectIntersectionObserver
      observe = vi.fn()
    }

    class TestResizeObserver {
      disconnect = disconnectResizeObserver
      observe = vi.fn()
    }

    vi.stubGlobal('IntersectionObserver', TestIntersectionObserver)
    vi.stubGlobal('ResizeObserver', TestResizeObserver)
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 17),
    )
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)
    const fixture = createControllerFixture()

    fixture.controller.onCommit()
    fixture.scope.stop()

    expect(disconnectIntersectionObserver).toHaveBeenCalledOnce()
    expect(disconnectResizeObserver).toHaveBeenCalledOnce()
    expect(cancelAnimationFrame).toHaveBeenCalledWith(17)
  })

  it('restores an explicit reading anchor as detached after page navigation', () => {
    const fixture = createControllerFixture()
    fixture.container.setMetrics({ scrollHeight: 1_200, scrollTop: 500 })
    const item = document.createElement('article')
    item.dataset.codexItemId = 'approval-return-item'
    fixture.container.element.append(item)
    item.getBoundingClientRect = () => ({ top: 40, bottom: 120 }) as DOMRect

    fixture.controller.restoreReadingAnchor({
      itemId: 'approval-return-item',
      offset: -24,
    })

    expect(fixture.controller.state.value).toBe(
      CodexTimelineScrollState.Detached,
    )
    expect(fixture.container.element.scrollTop).toBe(564)
    fixture.scope.stop()
  })
})
