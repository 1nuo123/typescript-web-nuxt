<template>
  <header
    class="flex min-w-0 items-center gap-3 border-b border-line bg-surface px-3 py-2.5 sm:px-4"
  >
    <NuxtLink
      :to="tasksRoute"
      class="grid size-8 shrink-0 place-items-center rounded-md text-ink-muted no-underline hover:bg-surface-muted hover:text-ink md:hidden"
      title="返回 Remote"
      aria-label="返回 Remote"
    >
      <ChevronLeft class="size-4" aria-hidden="true" />
    </NuxtLink>
    <div class="min-w-0 flex-1">
      <h1 class="m-0 truncate text-sm font-semibold sm:text-[0.9375rem]">
        {{ thread?.display_name || '正在同步会话' }}
      </h1>
      <p class="mt-0.5 mb-0 truncate text-[0.6875rem] text-ink-muted">
        {{ sessionStore.selectedWorkspace?.display_name || '未选择项目' }}
        <span v-if="sessionStore.selectedHost">
          · {{ sessionStore.selectedHost.display_name }}</span
        >
        <span> · {{ statusLabel }}</span>
        <span v-if="showModel"> · {{ thread?.model }}</span>
      </p>
    </div>

    <button
      type="button"
      class="relative grid size-8 shrink-0 place-items-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink"
      title="会话上下文"
      aria-label="会话上下文"
      @click="openContext"
    >
      <PanelRight class="size-4" aria-hidden="true" />
      <span
        v-if="pendingCount"
        class="absolute top-0 right-0 size-2 rounded-full bg-warning"
      />
    </button>

    <NuxtLink
      v-if="canOperate && sessionStore.selectedWorkspaceId"
      :to="executionSettingsRoute"
      class="grid size-8 shrink-0 place-items-center rounded-md text-ink-muted no-underline hover:bg-surface-muted hover:text-ink"
      title="运行设置"
      aria-label="运行设置"
    >
      <Settings2 class="size-4" aria-hidden="true" />
    </NuxtLink>

    <CodexTurnActions
      :active="activeTurn && canOperate"
      :interrupting="interrupting"
      @interrupt="$emit('interrupt')"
    />

    <details v-if="thread" class="relative">
      <summary
        class="grid size-8 list-none place-items-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink"
        title="会话菜单"
        aria-label="会话菜单"
      >
        <Ellipsis class="size-4" aria-hidden="true" />
      </summary>
      <div
        class="absolute top-9 right-0 z-50 grid w-40 rounded-md border border-line bg-elevated p-1 text-xs shadow-pop"
      >
        <button
          type="button"
          class="flex h-8 items-center gap-2 rounded px-2 text-left hover:bg-surface-muted"
          @click="beginRename"
        >
          <Pencil class="size-3.5" />重命名
        </button>
        <button
          type="button"
          class="flex h-8 items-center gap-2 rounded px-2 text-left hover:bg-surface-muted"
          @click="togglePin"
        >
          <PinOff v-if="thread.is_pinned" class="size-3.5" />
          <Pin v-else class="size-3.5" />
          {{ thread.is_pinned ? '取消置顶' : '置顶' }}
        </button>
        <button
          v-if="canCompact"
          type="button"
          class="flex h-8 items-center gap-2 rounded px-2 text-left hover:bg-surface-muted disabled:opacity-50"
          :disabled="activeTurn || compacting"
          @click="$emit('compact')"
        >
          <Minimize2 class="size-3.5" />{{
            compacting ? '压缩中…' : '压缩上下文'
          }}
        </button>
        <button
          type="button"
          class="flex h-8 items-center gap-2 rounded px-2 text-left hover:bg-surface-muted"
          @click="toggleArchive"
        >
          <ArchiveRestore v-if="thread.archived" class="size-3.5" />
          <Archive v-else class="size-3.5" />
          {{ thread.archived ? '恢复' : '归档' }}
        </button>
      </div>
    </details>

    <CodexConversationRenameDialog
      :open="renameOpen"
      :thread="thread"
      @close="closeRename"
    />
  </header>
</template>

<script setup lang="ts">
import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  Ellipsis,
  Minimize2,
  PanelRight,
  Pencil,
  Pin,
  PinOff,
  Settings2,
} from '@lucide/vue'
import { CodexThreadStatus } from '~/types/codex-thread'
import {
  buildCodexExecutionSettingsRoute,
  buildCodexTasksRoute,
} from '~/types/routes'
import { CodexContextView } from '~/stores/codex-ui'

defineProps<{
  activeTurn: boolean
  interrupting: boolean
  compacting: boolean
  canCompact: boolean
  canOperate: boolean
}>()

const emit = defineEmits<{
  interrupt: []
  compact: []
  'open-context': [view: CodexContextView, selectedItemId?: string]
}>()

const sessionStore = useCodexSessionStore()
const approvalStore = useCodexApprovalsStore()
const thread = computed(() => sessionStore.selectedThread)
const renameOpen = ref(false)

const tasksRoute = computed(() =>
  buildCodexTasksRoute({
    hostId: sessionStore.selectedHostId ?? undefined,
    workspaceId: sessionStore.selectedWorkspaceId ?? undefined,
  }),
)
const executionSettingsRoute = computed(() =>
  buildCodexExecutionSettingsRoute({
    hostId: sessionStore.selectedHostId ?? undefined,
    workspaceId: sessionStore.selectedWorkspaceId ?? undefined,
  }),
)
const pendingCount = computed(() =>
  thread.value
    ? approvalStore.pendingForThread(thread.value.upstream_thread_id).length
    : 0,
)
const showModel = computed(() => {
  const model = thread.value?.model
  const defaultModel = sessionStore.selectedHost?.capabilities.model_ids[0]
  return Boolean(model && model !== defaultModel)
})
const statusLabel = computed(() => {
  const labels: Readonly<Record<CodexThreadStatus, string>> = {
    [CodexThreadStatus.Idle]: '空闲',
    [CodexThreadStatus.Active]: '运行中',
    [CodexThreadStatus.Interrupted]: '已中断',
    [CodexThreadStatus.Failed]: '失败',
    [CodexThreadStatus.Unknown]: '状态未知',
    [CodexThreadStatus.Archived]: '已归档',
  }
  return thread.value ? labels[thread.value.status] : '同步中'
})

const openContext = (): void => {
  const view = pendingCount.value
    ? CodexContextView.Approvals
    : CodexContextView.Changes
  emit('open-context', view)
}

const beginRename = (): void => {
  if (!thread.value) return
  renameOpen.value = true
}

const closeRename = (): void => {
  renameOpen.value = false
}

const togglePin = async (): Promise<void> => {
  if (!thread.value) return
  await sessionStore.updateThreadPin(thread.value, !thread.value.is_pinned)
}

const toggleArchive = async (): Promise<void> => {
  if (!thread.value) return
  if (thread.value.archived) await sessionStore.unarchiveThread(thread.value)
  else await sessionStore.archiveThread(thread.value)
}

onBeforeUnmount(closeRename)
</script>
