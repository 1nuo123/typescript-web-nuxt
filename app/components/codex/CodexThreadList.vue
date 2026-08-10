<template>
  <div
    class="overflow-hidden rounded-lg border border-line bg-surface"
    aria-label="Codex 任务列表"
  >
    <button
      v-for="thread in threads"
      :key="thread.upstream_thread_id"
      type="button"
      class="group flex w-full items-center gap-3 border-b border-line px-4 py-3.5 text-left transition last:border-b-0"
      :class="
        thread.upstream_thread_id === selectedThreadId
          ? 'bg-primary-soft'
          : 'bg-surface hover:bg-surface-muted'
      "
      @click="$emit('select', thread.upstream_thread_id)"
    >
      <span
        class="grid size-8 shrink-0 place-items-center rounded-md border border-line bg-canvas text-ink-muted"
      >
        <MessageSquare class="size-3.5" aria-hidden="true" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-sm font-medium text-ink">
          {{ thread.display_name || '未命名任务' }}
        </span>
        <span class="mt-1 flex items-center gap-2 text-xs text-ink-muted">
          <span>{{ thread.model || '默认模型' }}</span>
          <span aria-hidden="true">/</span>
          <span>{{ statusLabel(thread.status) }}</span>
        </span>
      </span>
      <ChevronRight
        class="size-4 shrink-0 text-ink-muted transition group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </button>
    <p
      v-if="threads.length === 0"
      class="m-0 py-12 text-center text-sm text-ink-muted"
    >
      当前项目还没有任务。
    </p>
  </div>
</template>

<script setup lang="ts">
import { ChevronRight, MessageSquare } from '@lucide/vue'
import type { CodexThread } from '~/types/codex-thread'

defineProps<{
  threads: CodexThread[]
  selectedThreadId?: string | null
}>()

defineEmits<{ select: [threadId: string] }>()

const statusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    idle: '空闲',
    active: '运行中',
    notLoaded: '可继续',
    loaded: '已加载',
    interrupted: '已中断',
    unknown: '待恢复',
    archived: '已归档',
  }
  return labels[status] ?? status
}
</script>
