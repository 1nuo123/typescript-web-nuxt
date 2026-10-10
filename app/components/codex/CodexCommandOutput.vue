<template>
  <details
    :key="item.header.item_id"
    class="min-w-0 max-w-full overflow-hidden rounded-lg border border-line bg-surface-muted p-3"
  >
    <summary
      class="min-w-0 max-w-full cursor-pointer break-all font-mono text-xs font-semibold text-ink"
    >
      {{ item.detail.command || '命令执行' }}
      <span class="ml-2 font-sans" :class="failed ? 'text-danger' : 'text-ink-muted'">
        {{ statusLabel }}<template v-if="item.detail.exit_code !== null"> · 退出码 {{ item.detail.exit_code }}</template>
      </span>
    </summary>
    <pre
      class="mt-3 max-h-80 max-w-full overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-all font-mono text-xs text-ink-muted"
      >{{ item.detail.output || emptyOutputLabel }}</pre
    >
  </details>
</template>

<script setup lang="ts">
import { CodexTimelineItemStatus, type CodexCommandTimelineItem } from '~/types/codex-item'

const props = defineProps<{ item: CodexCommandTimelineItem }>()
const failed = computed(() =>
  props.item.header.status === CodexTimelineItemStatus.Failed ||
  (props.item.detail.exit_code !== null && props.item.detail.exit_code !== 0),
)
const statusLabel = computed(() => {
  if (failed.value) return '执行失败'
  if (props.item.header.status === CodexTimelineItemStatus.Streaming) return '执行中'
  return '执行完成'
})
const emptyOutputLabel = computed(() =>
  props.item.header.status === CodexTimelineItemStatus.Streaming
    ? '等待输出…'
    : `${statusLabel.value}，无输出`,
)
</script>
