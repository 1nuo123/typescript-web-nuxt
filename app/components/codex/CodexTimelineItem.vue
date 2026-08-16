<template>
  <article
    class="flex w-full min-w-0 max-w-full gap-3 overflow-hidden px-1 py-2"
    :class="
      item.detail.kind === CodexTimelineItemKind.UserMessage
        ? 'justify-end'
        : ''
    "
  >
    <div
      v-if="item.detail.kind !== CodexTimelineItemKind.UserMessage"
      class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border border-line bg-surface text-ink-muted"
      aria-hidden="true"
    >
      <component :is="itemIcon" class="size-3.5" />
    </div>
    <div class="min-w-0 max-w-full overflow-hidden" :class="contentClass">
      <div
        class="mb-1.5 flex items-center gap-2 text-[0.6875rem] font-medium text-ink-muted"
      >
        <span>{{ itemLabel }}</span>
        <span
          v-if="item.header.status === CodexTimelineItemStatus.Streaming"
          class="size-1.5 animate-pulse rounded-full bg-accent"
          aria-label="正在生成"
        />
      </div>
      <div
        v-if="
          item.detail.kind === CodexTimelineItemKind.UserMessage ||
          item.detail.kind === CodexTimelineItemKind.AgentMessage
        "
        class="codex-markdown break-words text-sm leading-6 text-ink"
      >
        <CodexMarkdown :source="item.detail.text" />
      </div>
      <div
        v-else-if="item.detail.kind === CodexTimelineItemKind.Notice"
        class="rounded-md border-l-2 border-line-strong bg-surface-muted px-3 py-2 text-sm text-ink-muted"
      >
        <CodexMarkdown :source="item.detail.text" />
      </div>
      <div
        v-else-if="item.detail.kind === CodexTimelineItemKind.ContextCompaction"
        class="text-sm text-ink-muted"
      >
        {{ item.detail.label }}
      </div>
      <CodexPlanCard
        v-else-if="item.detail.kind === CodexTimelineItemKind.Plan"
        :item="planItem"
      />
      <button
        v-else-if="
          item.detail.kind === CodexTimelineItemKind.Command ||
          item.detail.kind === CodexTimelineItemKind.Diff ||
          item.detail.kind === CodexTimelineItemKind.Approval
        "
        type="button"
        class="flex min-h-10 w-full min-w-0 items-center gap-2 rounded-md border border-line bg-surface-muted px-3 text-left text-xs hover:bg-elevated"
        @click="$emit('open-context', item.header.item_id, item.detail.kind)"
      >
        <component :is="itemIcon" class="size-3.5 shrink-0" />
        <span class="min-w-0 flex-1 truncate">{{ contextSummary }}</span>
        <ChevronRight class="size-3.5 shrink-0 text-ink-muted" />
      </button>
    </div>
  </article>
</template>

<script setup lang="ts">
import {
  Bot,
  ChevronRight,
  FileDiff,
  Files,
  Info,
  ListChecks,
  ShieldCheck,
  TerminalSquare,
} from '@lucide/vue'
import {
  CodexTimelineItemKind,
  CodexTimelineItemStatus,
  type CodexPlanTimelineItem,
  type CodexTimelineItem,
} from '~/types/codex-item'
import CodexMarkdown from './CodexMarkdown'

const props = defineProps<{ item: CodexTimelineItem }>()
defineEmits<{
  'open-context': [itemId: string, kind: CodexTimelineItemKind]
}>()

const contentClass = computed(() => {
  if (props.item.detail.kind === CodexTimelineItemKind.UserMessage) {
    return 'max-w-[88%] rounded-lg bg-surface-muted px-4 py-3 sm:max-w-[78%]'
  }
  if (
    props.item.detail.kind === CodexTimelineItemKind.Command ||
    props.item.detail.kind === CodexTimelineItemKind.Diff ||
    props.item.detail.kind === CodexTimelineItemKind.Plan
  ) {
    return 'flex-1 px-1 py-1'
  }
  return 'flex-1 px-1 py-1'
})

const planItem = computed(() => props.item as CodexPlanTimelineItem)

const itemIcon = computed(() => {
  const icons = {
    [CodexTimelineItemKind.AgentMessage]: Bot,
    [CodexTimelineItemKind.Plan]: ListChecks,
    [CodexTimelineItemKind.Command]: TerminalSquare,
    [CodexTimelineItemKind.Diff]: FileDiff,
    [CodexTimelineItemKind.Notice]: Info,
    [CodexTimelineItemKind.UserMessage]: Info,
    [CodexTimelineItemKind.Approval]: ShieldCheck,
    [CodexTimelineItemKind.ContextCompaction]: Files,
  }
  return icons[props.item.detail.kind]
})

const itemLabel = computed(() => {
  const labels: Record<CodexTimelineItemKind, string> = {
    [CodexTimelineItemKind.UserMessage]: '你',
    [CodexTimelineItemKind.AgentMessage]: 'Codex',
    [CodexTimelineItemKind.Plan]: '计划',
    [CodexTimelineItemKind.Command]: '命令',
    [CodexTimelineItemKind.Diff]: '变更',
    [CodexTimelineItemKind.Notice]: '状态',
    [CodexTimelineItemKind.Approval]: '审批',
    [CodexTimelineItemKind.ContextCompaction]: '上下文',
  }
  return labels[props.item.detail.kind]
})

const contextSummary = computed(() => {
  if (props.item.detail.kind === CodexTimelineItemKind.Command) {
    return props.item.detail.command || '命令输出'
  }
  if (props.item.detail.kind === CodexTimelineItemKind.Diff) {
    return `${props.item.detail.diff.files.length} 个文件变更`
  }
  if (props.item.detail.kind === CodexTimelineItemKind.Approval) {
    return props.item.detail.summary || '审批请求'
  }
  return ''
})
</script>
