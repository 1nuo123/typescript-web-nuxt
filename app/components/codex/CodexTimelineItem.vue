<template>
  <article
    class="codex-message flex w-full min-w-0 max-w-full gap-3 overflow-hidden px-1 py-3"
    :class="
      item.detail.kind === CodexTimelineItemKind.UserMessage
        ? 'justify-end'
        : ''
    "
  >
    <div
      v-if="
        item.detail.kind !== CodexTimelineItemKind.UserMessage &&
        item.detail.kind !== CodexTimelineItemKind.AgentMessage &&
        item.detail.kind !== CodexTimelineItemKind.Notice &&
        item.detail.kind !== CodexTimelineItemKind.Command &&
        item.detail.kind !== CodexTimelineItemKind.Plan
      "
      class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border border-line bg-surface text-ink-muted"
      aria-hidden="true"
    >
      <component :is="itemIcon" class="size-3.5" />
    </div>
    <div class="min-w-0 max-w-full overflow-hidden" :class="contentClass">
      <div
        v-if="
          item.detail.kind !== CodexTimelineItemKind.Command &&
          item.detail.kind !== CodexTimelineItemKind.Plan
        "
        class="mb-1.5 flex items-center gap-2 text-[0.6875rem] font-medium text-ink-muted"
      >
        <span>{{ itemLabel }}</span>
        <span
          v-if="item.header.status === CodexTimelineItemStatus.Streaming"
          class="size-1.5 animate-pulse rounded-full bg-accent"
          aria-label="正在生成"
        />
        <span
          v-else-if="failedClientOperationId"
          class="text-danger"
          aria-live="polite"
        >
          {{ awaitingConfirmation ? '受理状态待确认' : '发送失败' }}
        </span>
      </div>
      <div
        v-if="item.detail.kind === 'evicted'"
        class="rounded-md border border-line bg-surface-muted px-3 py-2 text-sm text-ink-muted"
      >
        <p class="m-0">较早内容已从当前页面内存回收。</p>
        <button
          type="button"
          class="mt-2 text-xs font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary"
          @click="$emit('reload', item.header.item_id)"
        >
          重新加载
        </button>
      </div>
      <div
        v-else-if="
          item.detail.kind === CodexTimelineItemKind.UserMessage ||
          item.detail.kind === CodexTimelineItemKind.AgentMessage
        "
        class="codex-markdown break-words text-[0.9375rem] leading-7 text-ink"
      >
        <CodexMarkdown
          :copyable="
            item.detail.kind === CodexTimelineItemKind.AgentMessage &&
            !item.detail.content
          "
          :source="item.detail.text"
          :streaming="item.header.status === CodexTimelineItemStatus.Streaming"
        />
        <button
          v-if="failedClientOperationId"
          type="button"
          class="mt-2 text-xs font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary"
          @click="$emit('retry', failedClientOperationId)"
        >
          {{ awaitingConfirmation ? '按原请求核对' : '重试发送' }}
        </button>
      </div>
      <div
        v-else-if="item.detail.kind === CodexTimelineItemKind.Notice"
        class="codex-markdown break-words text-[0.9375rem] leading-7 text-ink-muted"
      >
        <CodexMarkdown
          :source="item.detail.text"
          :streaming="item.header.status === CodexTimelineItemStatus.Streaming"
        />
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
      <CodexCommandOutput
        v-else-if="item.detail.kind === CodexTimelineItemKind.Command"
        :item="commandItem"
        show-context-link
        persist-expansion
        @open-context="
          $emit(
            'open-context',
            item.header.item_id,
            CodexTimelineItemKind.Command,
          )
        "
      />
      <button
        v-else-if="
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
      <CodexContentBody
        v-if="item.detail.kind !== 'evicted' && item.detail.content"
        :descriptor="item.detail.content"
        :thread-id="item.header.thread_id"
        :item-id="item.header.item_id"
      />
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
  type CodexCommandTimelineItem,
  type CodexTimelineRenderableItem,
} from '~/types/codex-item'
import CodexMarkdown from './CodexMarkdown'

const props = withDefaults(
  defineProps<{
    awaitingConfirmation?: boolean
    item: CodexTimelineRenderableItem
  }>(),
  { awaitingConfirmation: false },
)
defineEmits<{
  'open-context': [itemId: string, kind: CodexTimelineItemKind]
  retry: [clientOperationId: string]
  reload: [itemId: string]
}>()

const failedClientOperationId = computed(() => {
  if (
    props.item.detail.kind !== CodexTimelineItemKind.UserMessage ||
    props.item.header.status !== CodexTimelineItemStatus.Failed ||
    !props.item.header.item_id.startsWith('local-')
  ) {
    return null
  }
  return props.item.header.item_id.slice('local-'.length)
})

const contentClass = computed(() => {
  if (props.item.detail.kind === CodexTimelineItemKind.UserMessage) {
    return 'codex-message-user max-w-[88%] rounded-2xl bg-surface-muted px-4 py-3 sm:max-w-[75%]'
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

const commandItem = computed(() => props.item as CodexCommandTimelineItem)

const planItem = computed(() => props.item as CodexPlanTimelineItem)

const itemIcon = computed(() => {
  if (props.item.detail.kind === 'evicted') return Info
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
  if (props.item.detail.kind === 'evicted') return '已回收内容'
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
  if (props.item.detail.kind === CodexTimelineItemKind.Diff) {
    return `${props.item.detail.diff.files.length} 个文件变更`
  }
  if (props.item.detail.kind === CodexTimelineItemKind.Approval) {
    return props.item.detail.summary || '审批请求'
  }
  return ''
})
</script>
