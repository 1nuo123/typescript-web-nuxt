<template>
  <section class="grid min-h-dvh grid-rows-[auto_minmax(0,1fr)] bg-surface">
    <header
      class="grid gap-3 border-b border-line px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3"
    >
      <div class="flex min-w-0 items-center gap-2">
        <div class="min-w-0 flex-1">
          <h1 class="m-0 text-base font-semibold">Remote</h1>
          <p class="mt-0.5 mb-0 truncate text-xs text-ink-muted">
            {{ sessionStore.selectedHost?.display_name || '选择主机' }}
          </p>
        </div>
        <NuxtLink
          :to="CODEX_APPROVALS_ROUTE"
          class="relative grid size-9 place-items-center rounded-md text-ink-muted no-underline hover:bg-surface-muted"
          title="审批通知"
          aria-label="审批通知"
        >
          <Bell class="size-4" />
          <span
            v-if="approvalsStore.pending.length"
            class="absolute top-0 right-0 grid min-w-4 place-items-center rounded-full bg-warning px-1 text-[0.5625rem] font-bold leading-4 text-white"
          >
            {{ approvalsStore.pending.length }}
          </span>
        </NuxtLink>
        <button
          type="button"
          class="grid size-9 place-items-center rounded-md text-ink-muted hover:bg-surface-muted disabled:opacity-50"
          title="新建会话"
          aria-label="新建会话"
          :disabled="!canCreate || creating"
          @click="createConversation"
        >
          <SquarePen class="size-4" />
        </button>
      </div>
      <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <label class="relative min-w-0">
          <Monitor
            class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-muted"
          />
          <select
            :value="sessionStore.selectedHostId || ''"
            class="h-10 w-full min-w-0 appearance-none rounded-md border border-line bg-surface-muted pr-8 pl-8 text-xs"
            aria-label="选择主机"
            @change="selectHost"
          >
            <option value="" disabled>选择主机</option>
            <option
              v-for="host in sessionStore.hosts"
              :key="host.host_id"
              :value="host.host_id"
            >
              {{ host.display_name }} · {{ hostStatusLabel(host.status) }}
            </option>
          </select>
          <ChevronDown
            class="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-ink-muted"
          />
        </label>
        <NuxtLink
          :to="CODEX_SETTINGS_ROUTE"
          class="grid size-10 place-items-center rounded-md border border-line text-ink-muted no-underline"
          title="Remote 设置"
          aria-label="Remote 设置"
        >
          <Settings2 class="size-4" />
        </NuxtLink>
      </div>
      <form class="relative" @submit.prevent="submitSearch">
        <Search
          class="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-ink-muted"
        />
        <input
          v-model="searchTerm"
          type="search"
          class="h-10 w-full rounded-md border border-line bg-canvas pr-10 pl-9 text-sm outline-none"
          placeholder="搜索会话"
          aria-label="搜索会话"
        />
        <button
          type="submit"
          class="absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-md text-ink-muted"
          aria-label="搜索"
        >
          <ArrowRight class="size-4" />
        </button>
      </form>
    </header>

    <div
      class="min-h-0 overflow-y-auto px-3 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <AppSkeleton v-if="sessionStore.loading" class="h-48" />
      <AppAlert
        v-else-if="sessionStore.lastError"
        variant="danger"
        title="Remote 加载失败"
        :description="sessionStore.lastError.message"
      />
      <div v-else class="grid gap-4">
        <section
          v-for="group in projectGroups"
          :key="group.workspace.workspace_id"
          class="grid gap-1.5"
        >
          <button
            type="button"
            class="flex min-h-9 min-w-0 items-center gap-2 rounded-md px-2 text-left hover:bg-surface-muted"
            @click="selectWorkspace(group.workspace.workspace_id)"
          >
            <Folder class="size-3.5 shrink-0 text-ink-muted" />
            <strong class="min-w-0 flex-1 truncate text-xs">{{
              group.workspace.display_name
            }}</strong>
            <Pin
              v-if="group.workspace.is_pinned"
              class="size-3 text-ink-muted"
            />
            <ChevronRight class="size-3.5 text-ink-muted" />
          </button>
          <div class="grid gap-1">
            <NuxtLink
              v-for="thread in group.threads"
              :key="thread.upstream_thread_id"
              :to="threadRoute(thread)"
              class="grid min-h-14 min-w-0 gap-1 rounded-md bg-surface-muted px-3 py-2.5 no-underline"
              @click="sessionStore.selectThread(thread.upstream_thread_id)"
            >
              <span class="flex min-w-0 items-center gap-1.5">
                <Pin
                  v-if="thread.is_pinned"
                  class="size-3 shrink-0 text-ink-muted"
                />
                <span class="truncate text-sm font-medium">{{
                  thread.display_name
                }}</span>
              </span>
              <span class="truncate text-xs text-ink-muted">
                {{ threadStatusLabel(thread.status) }} ·
                {{ relativeTime(thread.recency_at) }}
              </span>
            </NuxtLink>
            <p
              v-if="group.threads.length === 0"
              class="m-0 px-3 py-2 text-xs text-ink-muted"
            >
              没有匹配的会话
            </p>
          </div>
        </section>
        <p
          v-if="projectGroups.length === 0"
          class="m-0 py-12 text-center text-sm text-ink-muted"
        >
          当前主机没有可用项目。
        </p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import {
  ArrowRight,
  Bell,
  ChevronDown,
  ChevronRight,
  Folder,
  Monitor,
  Pin,
  Search,
  Settings2,
  SquarePen,
} from '@lucide/vue'
import { AuthScope } from '~/types/auth'
import { CodexHostStatus } from '~/types/codex-host'
import { CodexThreadStatus, type CodexThread } from '~/types/codex-thread'
import type { CodexWorkspace } from '~/types/codex-workspace'
import {
  CODEX_APPROVALS_ROUTE,
  CODEX_SETTINGS_ROUTE,
  buildCodexTaskRoute,
} from '~/types/routes'

interface CodexMobileProjectGroup {
  workspace: CodexWorkspace
  threads: CodexThread[]
}

const MILLISECONDS_PER_MINUTE = 60_000
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
const relativeTimeFormatter = new Intl.RelativeTimeFormat('zh-CN', {
  numeric: 'auto',
})
const hostStatusLabels: Readonly<Record<CodexHostStatus, string>> = {
  [CodexHostStatus.Online]: '在线',
  [CodexHostStatus.Offline]: '离线',
  [CodexHostStatus.Enrolling]: '配对中',
  [CodexHostStatus.Incompatible]: '版本不兼容',
  [CodexHostStatus.Revoked]: '已吊销',
}
const threadStatusLabels: Readonly<Record<CodexThreadStatus, string>> = {
  [CodexThreadStatus.Idle]: '空闲',
  [CodexThreadStatus.Active]: '运行中',
  [CodexThreadStatus.Interrupted]: '已中断',
  [CodexThreadStatus.Failed]: '失败',
  [CodexThreadStatus.Unknown]: '状态未知',
  [CodexThreadStatus.Archived]: '已归档',
}

const sessionStore = useCodexSessionStore()
const approvalsStore = useCodexApprovalsStore()
const authStore = useAuthStore()
const searchTerm = ref(sessionStore.threadSearchTerm)
const creating = ref(false)

const projectGroups = computed<CodexMobileProjectGroup[]>(() =>
  sessionStore.workspaces
    .filter((workspace) => workspace.enabled)
    .map((workspace) => ({
      workspace,
      threads: sessionStore.hostThreads.filter(
        (thread) => thread.workspace_id === workspace.workspace_id,
      ),
    })),
)
const canCreate = computed(
  () =>
    Boolean(sessionStore.selectedWorkspaceId) &&
    sessionStore.selectedHost?.status === CodexHostStatus.Online &&
    authStore.canScope(AuthScope.CodexOperate) &&
    authStore.canScope(AuthScope.CodexFiles) &&
    authStore.canScope(AuthScope.CodexTerminal),
)

const hostStatusLabel = (status: CodexHostStatus): string =>
  hostStatusLabels[status]
const threadStatusLabel = (status: CodexThreadStatus): string =>
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
  return relativeTimeFormatter.format(
    Math.round(elapsedHours / HOURS_PER_DAY),
    'day',
  )
}
const threadRoute = (thread: CodexThread): string =>
  buildCodexTaskRoute(thread.upstream_thread_id, {
    hostId: thread.host_id,
    workspaceId: thread.workspace_id,
  })

const selectHost = async (event: Event): Promise<void> => {
  const hostId = (event.target as HTMLSelectElement).value
  if (!hostId) return
  await sessionStore.selectHost(hostId)
  await sessionStore.loadThreads(null)
}

const selectWorkspace = (workspaceId: string): void => {
  sessionStore.selectWorkspace(workspaceId)
}

const submitSearch = async (): Promise<void> => {
  await sessionStore.setThreadSearchTerm(searchTerm.value, null)
}

const createConversation = async (): Promise<void> => {
  const previousIds = new Set(
    sessionStore.hostThreads.map((thread) => thread.upstream_thread_id),
  )
  creating.value = true
  try {
    await sessionStore.createThread()
    await sessionStore.loadThreads(null)
    const created = sessionStore.hostThreads.find(
      (thread) => !previousIds.has(thread.upstream_thread_id),
    )
    if (!created) return
    sessionStore.clearPendingThreadStart()
    await navigateTo(threadRoute(created))
  } finally {
    creating.value = false
  }
}

onMounted(async () => {
  if (!sessionStore.hosts.length) await sessionStore.loadHosts()
  if (!sessionStore.selectedHostId && sessionStore.hosts[0]) {
    await sessionStore.selectHost(sessionStore.hosts[0].host_id)
  }
  if (sessionStore.selectedHostId) {
    await Promise.all([
      sessionStore.loadWorkspaces(),
      sessionStore.loadThreads(null),
    ])
  }
})
</script>
