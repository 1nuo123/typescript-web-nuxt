<template>
  <details
    :key="item.header.item_id"
    class="codex-process min-w-0"
    :open="expanded"
    @toggle="onToggle"
  >
    <summary class="codex-process-summary">
      <ListChecks class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="min-w-0 flex-1">计划</span>
      <span class="text-ink-muted"
        >{{ completedCount }}/{{ item.detail.steps.length }} 已完成</span
      >
      <ChevronRight
        class="codex-process-chevron size-3.5 shrink-0"
        aria-hidden="true"
      />
    </summary>
    <div class="codex-plan-body">
      <p
        v-if="item.detail.explanation"
        class="mt-0 text-sm leading-6 text-ink-muted"
      >
        {{ item.detail.explanation }}
      </p>
      <ol class="m-0 grid list-none gap-2.5 p-0">
        <li
          v-for="(step, index) in item.detail.steps"
          :key="`${index}-${step.step}`"
          class="flex min-w-0 items-start gap-2 text-sm leading-6"
        >
          <Check
            v-if="step.status === 'completed'"
            class="mt-1 size-3.5 shrink-0 text-accent"
            aria-hidden="true"
          />
          <LoaderCircle
            v-else-if="step.status === 'in_progress'"
            class="mt-1 size-3.5 shrink-0 animate-spin text-accent"
            aria-hidden="true"
          />
          <Circle
            v-else
            class="mt-1 size-3.5 shrink-0 text-ink-muted"
            aria-hidden="true"
          />
          <span class="sr-only">{{ stepLabels[step.status] }}：</span>
          <span
            class="min-w-0 break-words"
            :class="step.status === 'completed' ? 'text-ink-muted' : 'text-ink'"
            >{{ step.step }}</span
          >
        </li>
      </ol>
    </div>
  </details>
</template>

<script setup lang="ts">
import {
  Check,
  ChevronRight,
  Circle,
  ListChecks,
  LoaderCircle,
} from '@lucide/vue'
import type { CodexPlanTimelineItem } from '~/types/codex-item'
const props = defineProps<{ item: CodexPlanTimelineItem }>()
const uiStore = useCodexUiStore()
const expanded = computed(() =>
  uiStore.itemDisclosureOpen(
    props.item.header.thread_id,
    props.item.header.item_id,
    true,
  ),
)
const onToggle = (event: Event): void => {
  const open = (event.target as HTMLDetailsElement).open
  if (open !== expanded.value)
    uiStore.setItemDisclosureOpen(
      props.item.header.thread_id,
      props.item.header.item_id,
      open,
    )
}

const completedCount = computed(
  () =>
    props.item.detail.steps.filter((step) => step.status === 'completed')
      .length,
)
const stepLabels = {
  pending: '待执行',
  in_progress: '进行中',
  completed: '已完成',
}
</script>
