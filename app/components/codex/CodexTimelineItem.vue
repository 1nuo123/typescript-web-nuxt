<template>
  <article
    class="flex w-full min-w-0 max-w-full gap-3 overflow-hidden px-1 py-2"
    :class="
      item.kind === CodexTimelineItemKind.UserMessage ? 'justify-end' : ''
    "
  >
    <div
      v-if="item.kind !== CodexTimelineItemKind.UserMessage"
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
          v-if="item.status === CodexTimelineItemStatus.Streaming"
          class="size-1.5 animate-pulse rounded-full bg-accent"
          aria-label="正在生成"
        />
      </div>
      <div
        v-if="'text' in item"
        class="codex-markdown break-words text-sm leading-6 text-ink"
      >
        <CodexMarkdown :source="item.text" />
      </div>
      <CodexPlanCard
        v-else-if="item.kind === CodexTimelineItemKind.Plan"
        :item="item"
      />
      <CodexCommandOutput
        v-else-if="item.kind === CodexTimelineItemKind.Command"
        :item="item"
      />
      <CodexDiffView
        v-else-if="item.kind === CodexTimelineItemKind.Diff"
        :item="item"
      />
    </div>
  </article>
</template>

<script setup lang="ts">
import { Bot, FileDiff, Info, ListChecks, TerminalSquare } from '@lucide/vue'
import {
  CodexTimelineItemKind,
  CodexTimelineItemStatus,
  type CodexTimelineItem,
} from '~/types/codex-item'
import CodexMarkdown from './CodexMarkdown'

const props = defineProps<{ item: CodexTimelineItem }>()

const contentClass = computed(() => {
  if (props.item.kind === CodexTimelineItemKind.UserMessage) {
    return 'max-w-[88%] rounded-lg bg-surface-muted px-4 py-3 sm:max-w-[78%]'
  }
  if (
    props.item.kind === CodexTimelineItemKind.Command ||
    props.item.kind === CodexTimelineItemKind.Diff ||
    props.item.kind === CodexTimelineItemKind.Plan
  ) {
    return 'flex-1 px-1 py-1'
  }
  return 'flex-1 px-1 py-1'
})

const itemIcon = computed(() => {
  const icons = {
    [CodexTimelineItemKind.AgentMessage]: Bot,
    [CodexTimelineItemKind.Plan]: ListChecks,
    [CodexTimelineItemKind.Command]: TerminalSquare,
    [CodexTimelineItemKind.Diff]: FileDiff,
    [CodexTimelineItemKind.Notice]: Info,
    [CodexTimelineItemKind.UserMessage]: Info,
  }
  return icons[props.item.kind]
})

const itemLabel = computed(() => {
  const labels: Record<CodexTimelineItemKind, string> = {
    [CodexTimelineItemKind.UserMessage]: '你',
    [CodexTimelineItemKind.AgentMessage]: 'Codex',
    [CodexTimelineItemKind.Plan]: '计划',
    [CodexTimelineItemKind.Command]: '命令',
    [CodexTimelineItemKind.Diff]: '变更',
    [CodexTimelineItemKind.Notice]: '状态',
  }
  return labels[props.item.kind]
})
</script>
