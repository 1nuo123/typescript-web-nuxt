<template>
  <aside
    class="flex min-h-0 min-w-0 flex-col border-r border-line bg-canvas"
    aria-label="Codex 项目导航"
  >
    <header class="flex h-14 items-center gap-2 border-b border-line px-3">
      <span
        class="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-canvas"
      >
        <TerminalSquare class="size-4" aria-hidden="true" />
      </span>
      <strong class="min-w-0 truncate text-sm">Codex</strong>
      <NuxtLink
        :to="CODEX_APPROVALS_ROUTE"
        class="relative ml-auto grid size-8 shrink-0 place-items-center rounded-md text-ink-muted no-underline hover:bg-surface-muted hover:text-ink"
        title="审批通知"
        aria-label="审批通知"
      >
        <Bell class="size-4" aria-hidden="true" />
        <span
          v-if="approvalsStore.pending.length"
          class="absolute top-0.5 right-0.5 grid min-w-4 place-items-center rounded-full bg-warning px-1 text-[0.5625rem] font-bold leading-4 text-white"
        >
          {{ approvalsStore.pending.length }}
        </span>
      </NuxtLink>
    </header>

    <div class="grid gap-3 border-b border-line p-3">
      <label class="relative block min-w-0">
        <span class="sr-only">选择主机</span>
        <Monitor
          class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-muted"
        />
        <select
          :value="sessionStore.selectedHostId || ''"
          class="h-9 w-full min-w-0 appearance-none rounded-md border border-line bg-surface pr-7 pl-8 text-xs outline-none"
          @change="selectHost"
        >
          <option value="" disabled>选择主机</option>
          <option
            v-for="host in sessionStore.hosts"
            :key="host.host_id"
            :value="host.host_id"
          >
            {{ host.display_name }}
          </option>
        </select>
        <ChevronDown
          class="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-ink-muted"
        />
      </label>
      <button
        type="button"
        class="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-line bg-surface text-xs font-semibold hover:bg-surface-muted disabled:opacity-50"
        :disabled="!canCreateConversation || creating"
        @click="createConversation"
      >
        <SquarePen class="size-3.5" aria-hidden="true" />
        {{ creating ? '创建中…' : '新建会话' }}
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-2 py-3">
      <p
        class="m-0 px-2 pb-1.5 text-[0.6875rem] font-semibold text-ink-muted uppercase"
      >
        项目
      </p>
      <div class="grid gap-0.5">
        <div
          v-for="workspace in enabledWorkspaces"
          :key="workspace.workspace_id"
          class="group grid min-w-0 grid-cols-[minmax(0,1fr)_2rem] items-center rounded-md"
          :class="
            workspace.workspace_id === sessionStore.selectedWorkspaceId
              ? 'bg-surface-muted'
              : ''
          "
        >
          <button
            type="button"
            class="flex h-9 min-w-0 items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-surface-muted"
            @click="selectWorkspace(workspace.workspace_id)"
          >
            <Folder
              class="size-3.5 shrink-0 text-ink-muted"
              aria-hidden="true"
            />
            <span class="truncate">{{ workspace.display_name }}</span>
          </button>
          <button
            type="button"
            class="grid size-8 place-items-center rounded-md text-ink-muted opacity-0 hover:bg-elevated hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
            :title="workspace.is_pinned ? '取消置顶项目' : '置顶项目'"
            :aria-label="workspace.is_pinned ? '取消置顶项目' : '置顶项目'"
            @click="
              sessionStore.updateWorkspacePin(workspace, !workspace.is_pinned)
            "
          >
            <PinOff
              v-if="workspace.is_pinned"
              class="size-3.5"
              aria-hidden="true"
            />
            <Pin v-else class="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>

    <nav
      class="grid gap-0.5 border-t border-line p-2"
      aria-label="Codex 辅助导航"
    >
      <button
        type="button"
        class="flex h-9 items-center gap-2 rounded-md px-2 text-xs text-ink-muted hover:bg-surface-muted hover:text-ink"
        @click="openSearch"
      >
        <Search class="size-3.5" aria-hidden="true" />
        搜索会话
      </button>
      <button
        type="button"
        class="flex h-9 items-center gap-2 rounded-md px-2 text-xs text-ink-muted hover:bg-surface-muted hover:text-ink"
        @click="openArchive"
      >
        <Archive class="size-3.5" aria-hidden="true" />
        已归档
      </button>
      <NuxtLink
        :to="CODEX_SETTINGS_ROUTE"
        class="flex h-9 items-center gap-2 rounded-md px-2 text-xs text-ink-muted no-underline hover:bg-surface-muted hover:text-ink"
      >
        <Settings2 class="size-3.5" aria-hidden="true" />
        设置
      </NuxtLink>
    </nav>
  </aside>
</template>

<script setup lang="ts">
import {
  Archive,
  Bell,
  ChevronDown,
  Folder,
  Monitor,
  Pin,
  PinOff,
  Search,
  Settings2,
  SquarePen,
  TerminalSquare,
} from '@lucide/vue'
import { AuthScope } from '~/types/auth'
import { CodexHostStatus } from '~/types/codex-host'
import {
  CODEX_APPROVALS_ROUTE,
  CODEX_SETTINGS_ROUTE,
  buildCodexTaskRoute,
  buildCodexTasksRoute,
} from '~/types/routes'

const sessionStore = useCodexSessionStore()
const approvalsStore = useCodexApprovalsStore()
const authStore = useAuthStore()
const creating = ref(false)

const taskRouteFilters = () => ({
  searchTerm: sessionStore.threadSearchTerm || undefined,
  archived: sessionStore.showArchivedThreads,
})

const enabledWorkspaces = computed(() =>
  sessionStore.workspaces.filter((workspace) => workspace.enabled),
)
const canCreateConversation = computed(
  () =>
    Boolean(sessionStore.selectedWorkspaceId) &&
    sessionStore.selectedHost?.status === CodexHostStatus.Online &&
    authStore.canScope(AuthScope.CodexOperate) &&
    authStore.canScope(AuthScope.CodexFiles) &&
    authStore.canScope(AuthScope.CodexTerminal),
)

const selectHost = async (event: Event): Promise<void> => {
  const hostId = (event.target as HTMLSelectElement).value
  if (!hostId) return
  await sessionStore.selectHost(hostId)
  await navigateTo(
    buildCodexTasksRoute({
      hostId,
      workspaceId: sessionStore.selectedWorkspaceId ?? undefined,
      ...taskRouteFilters(),
    }),
  )
}

const selectWorkspace = async (workspaceId: string): Promise<void> => {
  sessionStore.selectWorkspace(workspaceId)
  await sessionStore.loadThreads(workspaceId)
  await navigateTo(
    buildCodexTasksRoute({
      hostId: sessionStore.selectedHostId ?? undefined,
      workspaceId,
      ...taskRouteFilters(),
    }),
  )
}

const createConversation = async (): Promise<void> => {
  const previousIds = new Set(
    sessionStore.threads.map((thread) => thread.upstream_thread_id),
  )
  creating.value = true
  try {
    await sessionStore.createThread()
    const created = await sessionStore.waitForCreatedThread(previousIds)
    if (!created) return
    sessionStore.clearPendingThreadStart()
    await navigateTo(
      buildCodexTaskRoute(created.upstream_thread_id, {
        hostId: created.host_id,
        workspaceId: created.workspace_id,
        ...taskRouteFilters(),
      }),
    )
  } finally {
    creating.value = false
  }
}

const openSearch = async (): Promise<void> => {
  if (sessionStore.showArchivedThreads) {
    await sessionStore.setArchivedThreadsVisible(false)
  }
  await navigateTo(
    buildCodexTasksRoute({
      hostId: sessionStore.selectedHostId ?? undefined,
      workspaceId: sessionStore.selectedWorkspaceId ?? undefined,
      ...taskRouteFilters(),
    }),
  )
}

const openArchive = async (): Promise<void> => {
  if (!sessionStore.showArchivedThreads) {
    await sessionStore.setArchivedThreadsVisible(true)
  }
  await navigateTo(
    buildCodexTasksRoute({
      hostId: sessionStore.selectedHostId ?? undefined,
      workspaceId: sessionStore.selectedWorkspaceId ?? undefined,
      ...taskRouteFilters(),
    }),
  )
}
</script>
