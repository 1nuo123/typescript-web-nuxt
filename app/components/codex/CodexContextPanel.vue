<template>
  <aside
    class="fixed inset-0 z-50 grid min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] bg-surface xl:static xl:z-auto xl:border-l xl:border-line"
    aria-label="会话上下文"
  >
    <header class="flex h-14 items-center gap-2 border-b border-line px-3">
      <strong class="min-w-0 flex-1 truncate text-sm">上下文</strong>
      <button
        type="button"
        class="grid size-8 place-items-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink"
        title="关闭上下文"
        aria-label="关闭上下文"
        @click="uiStore.closeContext"
      >
        <X class="size-4" aria-hidden="true" />
      </button>
    </header>
    <div
      class="grid grid-cols-3 border-b border-line p-1"
      role="tablist"
      aria-label="上下文类型"
    >
      <button
        v-for="tab in tabs"
        :key="tab.view"
        type="button"
        role="tab"
        :aria-selected="uiStore.contextView === tab.view"
        class="flex h-8 items-center justify-center gap-1.5 rounded text-xs"
        :class="
          uiStore.contextView === tab.view
            ? 'bg-surface-muted font-semibold'
            : 'text-ink-muted'
        "
        @click="uiStore.selectContext(tab.view)"
      >
        <component :is="tab.icon" class="size-3.5" aria-hidden="true" />
        {{ tab.label }}
        <span v-if="tab.count" class="text-[0.625rem] text-ink-muted">{{
          tab.count
        }}</span>
      </button>
    </div>

    <div class="min-h-0 overflow-y-auto p-3">
      <template v-if="uiStore.contextView === CodexContextView.Changes">
        <p
          v-if="diffItems.length === 0"
          class="m-0 py-10 text-center text-xs text-ink-muted"
        >
          当前会话还没有文件变更。
        </p>
        <div v-else class="grid gap-3">
          <select
            :value="selectedDiff?.header.item_id || ''"
            class="h-9 w-full min-w-0 rounded-md border border-line bg-surface px-2 text-xs"
            aria-label="选择文件变更"
            @change="selectDiff"
          >
            <option
              v-for="item in diffItems"
              :key="item.header.item_id"
              :value="item.header.item_id"
            >
              {{ item.detail.diff.files.length }} 个文件 ·
              {{ item.header.item_id }}
            </option>
          </select>
          <CodexDiffView v-if="selectedDiff" :item="selectedDiff" />
        </div>
      </template>

      <template v-else-if="uiStore.contextView === CodexContextView.Output">
        <p
          v-if="commandItems.length === 0"
          class="m-0 py-10 text-center text-xs text-ink-muted"
        >
          当前会话还没有命令输出。
        </p>
        <div v-else class="grid gap-3">
          <select
            :value="selectedCommand?.header.item_id || ''"
            class="h-9 w-full min-w-0 rounded-md border border-line bg-surface px-2 text-xs"
            aria-label="选择命令输出"
            @change="selectCommand"
          >
            <option
              v-for="item in commandItems"
              :key="item.header.item_id"
              :value="item.header.item_id"
            >
              {{ item.detail.command || '命令执行' }}
            </option>
          </select>
          <CodexCommandOutput v-if="selectedCommand" :item="selectedCommand" />
        </div>
      </template>

      <template v-else>
        <p
          v-if="pendingApprovals.length === 0"
          class="m-0 py-10 text-center text-xs text-ink-muted"
        >
          当前会话没有待处理审批。
        </p>
        <div v-else class="grid gap-3">
          <CodexApprovalCard
            v-for="approval in pendingApprovals"
            :key="approval.approval_id"
            :approval="approval"
          />
        </div>
      </template>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { FileDiff, ShieldCheck, TerminalSquare, X } from '@lucide/vue'
import {
  CodexTimelineItemKind,
  type CodexCommandTimelineItem,
  type CodexDiffTimelineItem,
} from '~/types/codex-item'
import { CodexContextView } from '~/stores/codex-ui'

const sessionStore = useCodexSessionStore()
const approvalStore = useCodexApprovalsStore()
const uiStore = useCodexUiStore()

const diffItems = computed<CodexDiffTimelineItem[]>(() =>
  sessionStore.selectedTimeline.filter(
    (item): item is CodexDiffTimelineItem =>
      item.detail.kind === CodexTimelineItemKind.Diff,
  ),
)
const commandItems = computed<CodexCommandTimelineItem[]>(() =>
  sessionStore.selectedTimeline.filter(
    (item): item is CodexCommandTimelineItem =>
      item.detail.kind === CodexTimelineItemKind.Command,
  ),
)
const pendingApprovals = computed(() =>
  sessionStore.selectedThreadId
    ? approvalStore.pendingForThread(sessionStore.selectedThreadId)
    : [],
)
const selectedDiff = computed(
  () =>
    diffItems.value.find(
      (item) => item.header.item_id === uiStore.selectedContextItemId,
    ) ??
    diffItems.value.at(-1) ??
    null,
)
const selectedCommand = computed(
  () =>
    commandItems.value.find(
      (item) => item.header.item_id === uiStore.selectedContextItemId,
    ) ??
    commandItems.value.at(-1) ??
    null,
)
const tabs = computed(() => [
  {
    view: CodexContextView.Changes,
    label: '变更',
    icon: FileDiff,
    count: diffItems.value.length,
  },
  {
    view: CodexContextView.Output,
    label: '输出',
    icon: TerminalSquare,
    count: commandItems.value.length,
  },
  {
    view: CodexContextView.Approvals,
    label: '审批',
    icon: ShieldCheck,
    count: pendingApprovals.value.length,
  },
])

const selectDiff = (event: Event): void => {
  uiStore.selectContext(
    CodexContextView.Changes,
    (event.target as HTMLSelectElement).value,
  )
}

const selectCommand = (event: Event): void => {
  uiStore.selectContext(
    CodexContextView.Output,
    (event.target as HTMLSelectElement).value,
  )
}
</script>
