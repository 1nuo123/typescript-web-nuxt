<template>
  <details
    class="min-w-0 max-w-full overflow-hidden rounded-lg border border-line bg-surface-muted p-3"
  >
    <summary
      class="min-w-0 max-w-full cursor-pointer break-all font-mono text-xs font-semibold text-ink"
    >
      {{ item.detail.command || '命令执行' }}
    </summary>
    <pre
      class="mt-3 max-h-80 max-w-full overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-all font-mono text-xs text-ink-muted"
      >{{ item.detail.output || '等待输出…' }}</pre
    >
  </details>
</template>

<script setup lang="ts">
import type { CodexCommandTimelineItem } from '~/types/codex-item'

defineProps<{ item: CodexCommandTimelineItem }>()
</script>
