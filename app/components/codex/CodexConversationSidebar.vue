<template>
  <aside
    class="flex min-h-0 min-w-0 flex-col border-r border-line bg-surface"
    aria-label="项目会话列表"
  >
    <header class="grid gap-2 border-b border-line p-3">
      <div class="flex min-w-0 items-center gap-2">
        <strong class="min-w-0 flex-1 truncate text-sm">
          {{ sessionStore.selectedWorkspace?.display_name || '选择项目' }}
        </strong>
        <button
          v-if="sessionStore.selectedWorkspace"
          type="button"
          class="grid size-8 shrink-0 place-items-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink"
          :title="
            sessionStore.selectedWorkspace.is_pinned
              ? '取消置顶项目'
              : '置顶项目'
          "
          :aria-label="
            sessionStore.selectedWorkspace.is_pinned
              ? '取消置顶项目'
              : '置顶项目'
          "
          @click="toggleWorkspacePin"
        >
          <PinOff
            v-if="sessionStore.selectedWorkspace.is_pinned"
            class="size-3.5"
          />
          <Pin v-else class="size-3.5" />
        </button>
      </div>
      <form class="relative" @submit.prevent="submitSearch">
        <Search
          class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-muted"
        />
        <input
          v-model="searchTerm"
          type="search"
          class="h-9 w-full rounded-md border border-line bg-canvas pr-9 pl-8 text-xs outline-none placeholder:text-ink-muted focus:border-line-strong"
          placeholder="搜索会话"
          aria-label="搜索会话"
        />
        <button
          type="submit"
          class="absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink"
          title="搜索"
          aria-label="搜索"
        >
          <ArrowRight class="size-3.5" />
        </button>
      </form>
      <div
        class="grid grid-cols-2 rounded-md border border-line p-0.5"
        role="tablist"
        aria-label="会话范围"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="!sessionStore.showArchivedThreads"
          class="h-7 rounded text-xs"
          :class="
            !sessionStore.showArchivedThreads
              ? 'bg-surface-muted font-semibold'
              : 'text-ink-muted'
          "
          @click="setArchived(false)"
        >
          会话
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="sessionStore.showArchivedThreads"
          class="h-7 rounded text-xs"
          :class="
            sessionStore.showArchivedThreads
              ? 'bg-surface-muted font-semibold'
              : 'text-ink-muted'
          "
          @click="setArchived(true)"
        >
          已归档
        </button>
      </div>
    </header>

    <div ref="threadListContainer" class="min-h-0 flex-1 overflow-y-auto p-2">
      <AppSkeleton v-if="sessionStore.loading" class="h-36" />
      <p
        v-else-if="sessionStore.threads.length === 0"
        class="m-0 px-3 py-10 text-center text-xs leading-5 text-ink-muted"
      >
        {{
          sessionStore.showArchivedThreads
            ? '当前项目没有已归档会话。'
            : '当前项目还没有会话。'
        }}
      </p>
      <div v-else class="grid gap-0.5">
        <article
          v-for="thread in sessionStore.threads"
          :key="thread.upstream_thread_id"
          :data-codex-thread-id="thread.upstream_thread_id"
          class="group relative grid min-w-0 grid-cols-[minmax(0,1fr)_2rem] rounded-md"
          :class="
            thread.upstream_thread_id === sessionStore.selectedThreadId
              ? 'bg-surface-muted'
              : ''
          "
        >
          <NuxtLink
            :to="threadRoute(thread)"
            class="grid min-w-0 gap-1 rounded-md px-3 py-2.5 no-underline hover:bg-surface-muted"
            @click="sessionStore.selectThread(thread.upstream_thread_id)"
          >
            <span class="flex min-w-0 items-center gap-1.5">
              <Pin
                v-if="thread.is_pinned"
                class="size-3 shrink-0 text-ink-muted"
                aria-hidden="true"
              />
              <span class="truncate text-xs font-medium">{{
                thread.display_name
              }}</span>
            </span>
            <span class="truncate text-[0.6875rem] text-ink-muted">
              {{ statusLabel(thread.status) }} ·
              {{ relativeTime(thread.recency_at) }}
            </span>
          </NuxtLink>
          <details class="relative self-center" @click.stop>
            <summary
              class="grid size-8 list-none place-items-center rounded-md text-ink-muted opacity-0 hover:bg-elevated hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
              title="会话菜单"
              aria-label="会话菜单"
            >
              <Ellipsis class="size-4" aria-hidden="true" />
            </summary>
            <div
              class="absolute top-8 right-0 z-40 grid w-36 rounded-md border border-line bg-elevated p-1 text-xs shadow-pop"
            >
              <button
                type="button"
                class="flex h-8 items-center gap-2 rounded px-2 text-left hover:bg-surface-muted"
                @click="beginRename(thread)"
              >
                <Pencil class="size-3.5" />重命名
              </button>
              <button
                type="button"
                class="flex h-8 items-center gap-2 rounded px-2 text-left hover:bg-surface-muted"
                @click="toggleThreadPin(thread)"
              >
                <PinOff v-if="thread.is_pinned" class="size-3.5" />
                <Pin v-else class="size-3.5" />
                {{ thread.is_pinned ? '取消置顶' : '置顶' }}
              </button>
              <button
                type="button"
                class="flex h-8 items-center gap-2 rounded px-2 text-left hover:bg-surface-muted"
                @click="toggleArchive(thread)"
              >
                <ArchiveRestore v-if="thread.archived" class="size-3.5" />
                <Archive v-else class="size-3.5" />
                {{ thread.archived ? '恢复' : '归档' }}
              </button>
            </div>
          </details>
        </article>
      </div>
    </div>

    <CodexConversationRenameDialog
      :open="renamingThread !== null"
      :thread="renamingThread"
      @close="closeRename"
    />
  </aside>
</template>

<script setup lang="ts">
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  Ellipsis,
  Pencil,
  Pin,
  PinOff,
  Search,
} from '@lucide/vue'
import { CodexThreadStatus, type CodexThread } from '~/types/codex-thread'
import { buildCodexTaskRoute, buildCodexTasksRoute } from '~/types/routes'
import { useCodexThreadListScrollAnchor } from '~/composables/useCodexThreadListScrollAnchor'

const MILLISECONDS_PER_MINUTE = 60_000
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
const DAYS_PER_WEEK = 7
const relativeTimeFormatter = new Intl.RelativeTimeFormat('zh-CN', {
  numeric: 'auto',
})
const threadStatusLabels: Readonly<Record<CodexThreadStatus, string>> = {
  [CodexThreadStatus.Idle]: '空闲',
  [CodexThreadStatus.Active]: '运行中',
  [CodexThreadStatus.Interrupted]: '已中断',
  [CodexThreadStatus.Failed]: '失败',
  [CodexThreadStatus.Unknown]: '状态未知',
  [CodexThreadStatus.Archived]: '已归档',
}

const sessionStore = useCodexSessionStore()
const uiStore = useCodexUiStore()
const searchTerm = ref(sessionStore.threadSearchTerm)
const renamingThread = ref<CodexThread | null>(null)
const threadListContainer = ref<HTMLElement | null>(null)
const threadListAnchor = useCodexThreadListScrollAnchor(threadListContainer)

const taskRouteFilters = () => ({
  searchTerm: sessionStore.threadSearchTerm || undefined,
  archived: sessionStore.showArchivedThreads,
})
const threadListRouteKey = computed(() =>
  JSON.stringify({
    hostId: sessionStore.selectedHostId,
    workspaceId: sessionStore.selectedWorkspaceId,
    searchTerm: sessionStore.threadSearchTerm,
    archived: sessionStore.showArchivedThreads,
  }),
)

watch(
  () =>
    sessionStore.threads.map((thread) =>
      [
        thread.upstream_thread_id,
        thread.recency_at,
        thread.status,
        thread.turn_runtime?.phase ?? '',
        thread.turn_runtime?.lease_generation ?? '',
      ].join(':'),
    ),
  () => {
    threadListAnchor.capture()
    threadListAnchor.restore()
  },
  { flush: 'sync' },
)

const statusLabel = (status: CodexThreadStatus): string =>
  threadStatusLabels[status]

const relativeTime = (timestamp: string): string => {
  const elapsedMinutes = Math.round(
    (Date.parse(timestamp) - Date.now()) / MILLISECONDS_PER_MINUTE,
  )
  if (Math.abs(elapsedMinutes) < MINUTES_PER_HOUR) {
    return relativeTimeFormatter.format(elapsedMinutes, 'minute')
  }
  const elapsedHours = Math.round(elapsedMinutes / MINUTES_PER_HOUR)
  if (Math.abs(elapsedHours) < HOURS_PER_DAY) {
    return relativeTimeFormatter.format(elapsedHours, 'hour')
  }
  const elapsedDays = Math.round(elapsedHours / HOURS_PER_DAY)
  if (Math.abs(elapsedDays) < DAYS_PER_WEEK) {
    return relativeTimeFormatter.format(elapsedDays, 'day')
  }
  return new Date(timestamp).toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  })
}

const threadRoute = (thread: CodexThread): string =>
  buildCodexTaskRoute(thread.upstream_thread_id, {
    hostId: thread.host_id,
    workspaceId: thread.workspace_id,
    ...taskRouteFilters(),
  })

const submitSearch = async (): Promise<void> => {
  await sessionStore.setThreadSearchTerm(searchTerm.value)
  await navigateTo(
    buildCodexTasksRoute({
      hostId: sessionStore.selectedHostId ?? undefined,
      workspaceId: sessionStore.selectedWorkspaceId ?? undefined,
      ...taskRouteFilters(),
    }),
  )
}

const setArchived = async (archived: boolean): Promise<void> => {
  if (archived === sessionStore.showArchivedThreads) return
  await sessionStore.setArchivedThreadsVisible(archived)
  await navigateTo(
    buildCodexTasksRoute({
      hostId: sessionStore.selectedHostId ?? undefined,
      workspaceId: sessionStore.selectedWorkspaceId ?? undefined,
      ...taskRouteFilters(),
    }),
  )
}

watch(
  () => sessionStore.threadSearchTerm,
  (value) => {
    searchTerm.value = value
  },
)

const toggleWorkspacePin = async (): Promise<void> => {
  const workspace = sessionStore.selectedWorkspace
  if (!workspace) return
  await sessionStore.updateWorkspacePin(workspace, !workspace.is_pinned)
}

const beginRename = (thread: CodexThread): void => {
  renamingThread.value = thread
}

const closeRename = (): void => {
  renamingThread.value = null
}

const toggleThreadPin = async (thread: CodexThread): Promise<void> => {
  await sessionStore.updateThreadPin(thread, !thread.is_pinned)
}

const toggleArchive = async (thread: CodexThread): Promise<void> => {
  if (thread.archived) await sessionStore.unarchiveThread(thread)
  else await sessionStore.archiveThread(thread)
}

onBeforeUnmount(closeRename)

onMounted(() => {
  void nextTick(() => {
    const container = threadListContainer.value
    if (!container) return
    container.scrollTop =
      uiStore.threadListScrollTopByRouteKey[threadListRouteKey.value] ?? 0
  })
})

onBeforeUnmount(() => {
  if (threadListContainer.value) {
    uiStore.setThreadListScrollPosition(
      threadListRouteKey.value,
      threadListContainer.value.scrollTop,
    )
  }
})
</script>
