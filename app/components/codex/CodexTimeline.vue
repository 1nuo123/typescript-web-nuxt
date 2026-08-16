<template>
  <div
    ref="scrollElement"
    class="h-full min-h-0 max-w-full touch-pan-y overflow-x-hidden overflow-y-auto overscroll-x-none overscroll-y-contain px-1"
    aria-live="polite"
    aria-label="会话时间线"
    tabindex="0"
    @scroll="updateStickToBottom"
  >
    <div
      v-if="items.length > 0"
      class="relative w-full min-w-0 max-w-full overflow-x-hidden"
      :style="{ height: `${totalSize}px` }"
    >
      <div
        v-for="row in virtualRows"
        :key="String(row.key)"
        :ref="(element) => measureRow(element as Element | null)"
        class="absolute top-0 left-0 w-full min-w-0 max-w-full overflow-x-hidden pb-1"
        :data-index="row.index"
        :style="{ transform: `translateY(${row.start}px)` }"
      >
        <CodexTimelineItemBoundary
          v-if="items[row.index]"
          :item="items[row.index]!"
          @open-context="(itemId, kind) => $emit('open-context', itemId, kind)"
        />
      </div>
    </div>
    <p
      v-if="items.length === 0 && !working"
      class="mx-auto max-w-sm py-20 text-center text-sm leading-6 text-ink-muted"
    >
      发送第一条消息，Codex 会在所选电脑和项目中开始工作。
    </p>
    <CodexWorkingIndicator v-if="working" />
    <button
      v-if="!stickToBottom && (items.length > 0 || working)"
      type="button"
      class="sticky bottom-3 left-1/2 z-10 mx-auto block rounded-full border border-line bg-surface px-3 py-1.5 text-xs shadow-card"
      @click="scrollToLatest"
    >
      跳到最新
    </button>
  </div>
</template>

<script setup lang="ts">
import { useVirtualizer } from '@tanstack/vue-virtual'
import type {
  CodexTimelineItem,
  CodexTimelineItemKind,
} from '~/types/codex-item'

const props = withDefaults(
  defineProps<{
    items: CodexTimelineItem[]
    threadId: string
    working?: boolean
  }>(),
  { working: false },
)
defineEmits<{
  'open-context': [itemId: string, kind: CodexTimelineItemKind]
}>()
const uiStore = useCodexUiStore()
const scrollElement = ref<HTMLElement | null>(null)
const stickToBottom = ref(
  uiStore.timelineFollowByThreadId[props.threadId] ?? true,
)
const virtualizerOptions = computed(() => ({
  count: props.items.length,
  getScrollElement: () => scrollElement.value,
  estimateSize: () => 112,
  getItemKey: (index: number) => props.items[index]?.header.item_id ?? index,
  overscan: 6,
}))
const virtualizer = useVirtualizer(virtualizerOptions)
const virtualRows = computed(() => virtualizer.value.getVirtualItems())
const totalSize = computed(() => virtualizer.value.getTotalSize())

const measureRow = (element: Element | null): void => {
  if (element) virtualizer.value.measureElement(element)
}

const updateStickToBottom = (): void => {
  const element = scrollElement.value
  if (!element) return
  stickToBottom.value =
    element.scrollHeight - element.scrollTop - element.clientHeight < 160
  uiStore.setTimelinePosition(
    props.threadId,
    stickToBottom.value,
    element.scrollTop,
  )
}

const scrollToLatest = (): void => {
  stickToBottom.value = true
  const element = scrollElement.value
  if (!element) return
  element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' })
  uiStore.setTimelinePosition(props.threadId, true, element.scrollHeight)
}

watch(
  () => [props.items.length, props.working] as const,
  async () => {
    await nextTick()
    virtualizer.value.measure()
    if (!stickToBottom.value) return
    await nextTick()
    const element = scrollElement.value
    if (element) {
      element.scrollTop = element.scrollHeight
      uiStore.setTimelinePosition(props.threadId, true, element.scrollTop)
    }
  },
  { immediate: true, flush: 'post' },
)

onMounted(async () => {
  await nextTick()
  virtualizer.value.measure()
  await nextTick()
  const element = scrollElement.value
  if (!element) return
  if (stickToBottom.value) {
    element.scrollTop = element.scrollHeight
    return
  }
  element.scrollTop = uiStore.timelineScrollTopByThreadId[props.threadId] ?? 0
})

onBeforeUnmount(() => {
  const element = scrollElement.value
  if (!element) return
  uiStore.setTimelinePosition(
    props.threadId,
    stickToBottom.value,
    element.scrollTop,
  )
})
</script>
