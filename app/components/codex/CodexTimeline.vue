<template>
  <div
    ref="scrollElement"
    class="h-full min-h-0 max-w-full touch-pan-y overflow-x-hidden overflow-y-auto overscroll-x-none overscroll-y-contain px-1"
    aria-live="polite"
    aria-label="任务时间线"
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
        <CodexTimelineItem v-if="items[row.index]" :item="items[row.index]!" />
      </div>
    </div>
    <p
      v-if="items.length === 0"
      class="mx-auto max-w-sm py-20 text-center text-sm leading-6 text-ink-muted"
    >
      发送第一条消息，Codex 会在所选电脑和项目中开始工作。
    </p>
    <button
      v-if="!stickToBottom && items.length > 0"
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
import type { CodexTimelineItem } from '~/types/codex-item'

const props = defineProps<{ items: CodexTimelineItem[] }>()
const scrollElement = ref<HTMLElement | null>(null)
const stickToBottom = ref(true)
const virtualizerOptions = computed(() => ({
  count: props.items.length,
  getScrollElement: () => scrollElement.value,
  estimateSize: () => 112,
  getItemKey: (index: number) => props.items[index]?.item_id ?? index,
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
}

const scrollToLatest = (): void => {
  stickToBottom.value = true
  if (props.items.length > 0) {
    virtualizer.value.scrollToIndex(props.items.length - 1, { align: 'end' })
  }
}

watch(
  () => props.items.length,
  async () => {
    await nextTick()
    virtualizer.value.measure()
    if (!stickToBottom.value || props.items.length === 0) return
    virtualizer.value.scrollToIndex(props.items.length - 1, { align: 'end' })
  },
  { immediate: true, flush: 'post' },
)
</script>
