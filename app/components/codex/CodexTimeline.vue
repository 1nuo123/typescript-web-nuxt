<template>
  <div class="relative h-full min-h-0">
    <div
      ref="container"
      class="h-full min-h-0 max-w-full touch-pan-y overflow-x-hidden overflow-y-auto overscroll-x-none overscroll-y-contain px-1"
      aria-live="polite"
      aria-label="会话时间线"
      tabindex="0"
      @scroll="handleScroll"
      @wheel.passive="handleWheel"
      @touchstart.passive="handleTouchStart"
      @touchmove.passive="handleTouchMove"
      @pointerdown.passive="handlePointerDown"
      @pointermove.passive="handlePointerMove"
      @keydown="handleKeydown"
    >
      <div
        v-if="items.length > 0"
        class="codex-reading-column relative w-full min-w-0 overflow-x-hidden"
        :style="{ height: `${totalSize}px` }"
      >
        <div
          v-for="row in virtualRows"
          :key="String(row.key)"
          :ref="(element) => measureRow(element as Element | null)"
          class="absolute top-0 left-0 w-full min-w-0 max-w-full overflow-x-hidden pb-1"
          :data-index="row.index"
          :data-codex-item-id="items[row.index]?.header.item_id"
          :style="{ transform: `translateY(${row.start}px)` }"
        >
          <CodexTimelineItemBoundary
            v-if="items[row.index]"
            :awaiting-confirmation="
              confirmationRequiredOperationIds.includes(
                items[row.index]!.header.item_id.slice('local-'.length),
              )
            "
            :item="items[row.index]!"
            @open-context="
              (itemId, kind) => $emit('open-context', itemId, kind)
            "
            @retry="(clientOperationId) => $emit('retry', clientOperationId)"
            @reload="(itemId) => $emit('reload', itemId)"
          />
        </div>
      </div>
      <p
        v-if="items.length === 0 && !working"
        class="mx-auto max-w-sm py-20 text-center text-sm leading-6 text-ink-muted"
      >
        发送第一条消息，Codex 会在所选电脑和项目中开始工作。
      </p>
      <CodexWorkingIndicator v-if="working" :label="workingLabel" />
      <div ref="bottomSentinel" class="h-px w-full" aria-hidden="true" />
    </div>
    <button
      v-if="!effectiveFollowing && (items.length > 0 || working)"
      type="button"
      class="absolute right-4 bottom-3 z-10 rounded-full border border-line bg-elevated px-4 py-2 text-xs shadow-card"
      @click="handleScrollToLatest"
    >
      跳到最新
    </button>
  </div>
</template>

<script setup lang="ts">
import { useVirtualizer } from '@tanstack/vue-virtual'
import type {
  CodexTimelineItemKind,
  CodexTimelineRenderableItem,
} from '~/types/codex-item'
import type { CodexTimelineScrollAnchor } from '~/types/codex-timeline-scroll'
import { getCodexTimelineOverscan } from '~/composables/useCodexTimelineScrollController'

const props = withDefaults(
  defineProps<{
    items: CodexTimelineRenderableItem[]
    confirmationRequiredOperationIds?: readonly string[]
    threadId: string
    working?: boolean
    workingLabel?: string
  }>(),
  {
    confirmationRequiredOperationIds: () => [],
    working: false,
    workingLabel: '正在处理',
  },
)
defineEmits<{
  'open-context': [itemId: string, kind: CodexTimelineItemKind]
  retry: [clientOperationId: string]
  reload: [itemId: string]
}>()

const uiStore = useCodexUiStore()
const experienceFlags = useCodexExperienceFeatureFlags()
const { isMobile } = useBreakpoints()
const performanceDiagnostics = useCodexClientPerformanceDiagnostics()
const useScrollControllerV2 = computed(() =>
  experienceFlags.isEnabled('codex_scroll_controller_v2'),
)
const viewportHeight = ref(0)
const initialFollowing =
  uiStore.timelineFollowByThreadId[props.threadId] ?? true
const {
  attach,
  bottomSentinel,
  captureAnchor,
  container,
  dispose,
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
  restoreReadingAnchor: restoreControllerReadingAnchor,
  scrollToLatest,
} = useCodexTimelineScrollController({
  initialFollowing,
  persistPosition: (following, scrollTop) =>
    uiStore.setTimelinePosition(props.threadId, following, scrollTop),
  onViewportResize: (height) => {
    viewportHeight.value = height
  },
  recordPerformance: (measurement) =>
    performanceDiagnostics.record(measurement),
})
const legacyFollowing = ref(initialFollowing)

/** 旧路径只在独立开关关闭时使用，保留原有贴底判定和单次滚动写入语义。 */
const updateLegacyFollowing = (): void => {
  const element = container.value
  if (!element) return
  legacyFollowing.value =
    element.scrollHeight - element.scrollTop - element.clientHeight < 160
  uiStore.setTimelinePosition(
    props.threadId,
    legacyFollowing.value,
    element.scrollTop,
  )
}

const scrollLegacyToLatest = (): void => {
  legacyFollowing.value = true
  const element = container.value
  if (!element) return
  element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' })
  uiStore.setTimelinePosition(props.threadId, true, element.scrollHeight)
}

const effectiveFollowing = computed(() =>
  useScrollControllerV2.value ? isFollowing.value : legacyFollowing.value,
)

const handleScroll = (): void => {
  if (useScrollControllerV2.value) onScroll()
  else updateLegacyFollowing()
}
const handleWheel = (event: WheelEvent): void => {
  if (useScrollControllerV2.value) onWheel(event)
}
const handleTouchStart = (event: TouchEvent): void => {
  if (useScrollControllerV2.value) onTouchStart(event)
}
const handleTouchMove = (event: TouchEvent): void => {
  if (useScrollControllerV2.value) onTouchMove(event)
}
const handlePointerDown = (event: PointerEvent): void => {
  if (useScrollControllerV2.value) onPointerDown(event)
}
const handlePointerMove = (event: PointerEvent): void => {
  if (useScrollControllerV2.value) onPointerMove(event)
}
const handleKeydown = (event: KeyboardEvent): void => {
  if (useScrollControllerV2.value) onKeydown(event)
}
const handleScrollToLatest = (): void => {
  if (useScrollControllerV2.value) scrollToLatest()
  else scrollLegacyToLatest()
}

const virtualizerOptions = computed(() => ({
  count: props.items.length,
  getScrollElement: () => container.value,
  estimateSize: () => 112,
  getItemKey: (index: number) => props.items[index]?.header.item_id ?? index,
  overscan: getCodexTimelineOverscan(viewportHeight.value, isMobile.value),
}))
const virtualizer = useVirtualizer(virtualizerOptions)
const virtualRows = computed(() => virtualizer.value.getVirtualItems())
const totalSize = computed(() => virtualizer.value.getTotalSize())

const measureRow = (element: Element | null): void => {
  if (!element) return
  if (useScrollControllerV2.value) captureAnchor()
  virtualizer.value.measureElement(element)
  if (useScrollControllerV2.value) onCommit()
}

watch(
  () => [props.items, props.working] as const,
  async () => {
    await nextTick()
    // Row refs and ResizeObserver retain measurements by item ID. Clearing
    // every cached height here would replace unchanged rows with estimates.
    if (useScrollControllerV2.value) {
      onCommit()
      return
    }
    if (!legacyFollowing.value) return
    await nextTick()
    const element = container.value
    if (element) {
      element.scrollTop = element.scrollHeight
      uiStore.setTimelinePosition(props.threadId, true, element.scrollTop)
    }
  },
  { immediate: true, flush: 'post', deep: false },
)

onMounted(async () => {
  await nextTick()
  await experienceFlags.load()
  if (useScrollControllerV2.value && container.value && bottomSentinel.value) {
    attach(container.value, bottomSentinel.value)
  }
  if (useScrollControllerV2.value) onCommit()
  else if (legacyFollowing.value && container.value)
    container.value.scrollTop = container.value.scrollHeight
})

onBeforeUnmount(() => {
  if (useScrollControllerV2.value) {
    captureAnchor()
    onScroll()
    dispose()
    return
  }
  const element = container.value
  if (element)
    uiStore.setTimelinePosition(
      props.threadId,
      legacyFollowing.value,
      element.scrollTop,
    )
})

/** 返回当前虚拟窗口的稳定 ID，内存回收不能替换这些正在阅读的条目。 */
const visibleItemIds = (): string[] =>
  virtualRows.value.flatMap((row) => {
    const itemId = props.items[row.index]?.header.item_id
    return itemId ? [itemId] : []
  })

/**
 * 返回会话时先让虚拟列表挂载锚点条目，再由滚动控制器恢复偏移；
 * 不直接写入 scrollTop，避免绕过 detached/following 状态机。
 */
const restoreReadingAnchor = async (
  anchor: CodexTimelineScrollAnchor,
): Promise<void> => {
  const itemIndex = props.items.findIndex(
    (item) => item.header.item_id === anchor.itemId,
  )
  if (itemIndex < 0) return
  virtualizer.value.scrollToIndex(itemIndex, { align: 'start' })
  await nextTick()
  restoreControllerReadingAnchor(anchor)
}

/** 父级布局变动时仅委托本控制器恢复阅读锚点，避免新增第二条滚动写入路径。 */
defineExpose({
  captureAnchor,
  onCommit,
  restoreAnchor,
  restoreReadingAnchor,
  visibleItemIds,
})
</script>
