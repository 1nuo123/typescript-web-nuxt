<template>
  <section class="mx-auto grid w-full min-w-0 max-w-5xl grid-cols-1 gap-5">
    <header
      class="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5"
    >
      <div>
        <h1 class="m-0 text-2xl font-bold">任务</h1>
        <p class="mt-1 mb-0 text-sm text-ink-muted">
          {{ sessionStore.selectedWorkspace?.display_name || '选择一个项目' }}
        </p>
      </div>
      <BaseButton
        v-if="canOperate"
        :disabled="createDisabled"
        @click="createThread"
      >
        <Plus class="size-4" aria-hidden="true" />
        {{ createButtonLabel }}
      </BaseButton>
    </header>

    <AppAlert
      v-if="sessionStore.lastError"
      variant="danger"
      title="任务加载失败"
      :description="sessionStore.lastError.message"
    />
    <AppAlert
      v-else-if="operationError"
      variant="danger"
      title="操作失败"
      :description="operationError"
    />
    <AppAlert
      v-else-if="hostUnavailable"
      variant="warning"
      title="主机离线"
      description="启动本机 Codex Agent，主机在线后再创建任务。"
    />
    <AppAlert
      v-else-if="operationMessage"
      variant="success"
      title="操作已受理"
      :description="operationMessage"
    />

    <div
      class="grid min-w-0 grid-cols-1 gap-3 rounded-lg border border-line bg-surface p-4 shadow-card md:grid-cols-2"
    >
      <BaseSelect
        :model-value="sessionStore.selectedHostId || ''"
        label="主机"
        :options="hostOptions"
        :disabled="sessionStore.loading"
        @update:model-value="selectHost"
      />
      <BaseSelect
        :model-value="sessionStore.selectedWorkspaceId || ''"
        label="项目"
        :options="workspaceOptions"
        :disabled="sessionStore.loading || workspaceOptions.length === 0"
        @update:model-value="selectWorkspace"
      />
    </div>

    <div>
      <div class="mb-3 flex items-center justify-between gap-3">
        <h2 class="m-0 text-xs font-semibold text-ink-muted uppercase">
          最近任务
        </h2>
        <span class="text-xs text-ink-muted">{{
          sessionStore.threads.length
        }}</span>
      </div>
      <AppSkeleton v-if="sessionStore.loading" class="h-40" />
      <CodexThreadList
        v-else
        :threads="sessionStore.threads"
        :selected-thread-id="sessionStore.selectedThreadId"
        @select="openThread"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { Plus } from '@lucide/vue'
import { AuthScope } from '~/types/auth'
import { RuntimeFeatureFlag } from '~/types/app'
import { CodexHostStatus } from '~/types/codex-host'
import { LOGIN_ROUTE, buildCodexTaskRoute } from '~/types/routes'
import { normalizeApiError } from '~/utils/errors'

definePageMeta({
  layout: 'codex',
  requiresAuth: true,
  redirectTo: LOGIN_ROUTE,
  requiredScopes: [AuthScope.CodexRead],
  requiredRuntimeFlag: RuntimeFeatureFlag.Codex,
  title: 'Codex 任务',
})

const sessionStore = useCodexSessionStore()
const authStore = useAuthStore()
const creating = ref(false)
const operationMessage = ref('')
const operationError = ref('')
const canOperate = computed(() => authStore.canScope(AuthScope.CodexOperate))
const selectedHost = computed(() => sessionStore.selectedHost)
const hostUnavailable = computed(
  () =>
    Boolean(selectedHost.value) &&
    selectedHost.value?.status !== CodexHostStatus.Online,
)
const createDisabled = computed(
  () =>
    !sessionStore.selectedWorkspaceId ||
    creating.value ||
    hostUnavailable.value,
)
const createButtonLabel = computed(() => {
  if (creating.value) return '创建中…'
  if (sessionStore.pendingThreadStart) return '继续创建'
  return '新建任务'
})
const hostStatusLabels: Record<string, string> = {
  [CodexHostStatus.Online]: '在线',
  [CodexHostStatus.Offline]: '离线',
  [CodexHostStatus.Enrolling]: '配对中',
  [CodexHostStatus.Incompatible]: '版本不兼容',
  [CodexHostStatus.Revoked]: '已吊销',
}
const hostOptions = computed(() =>
  sessionStore.hosts.map((host) => ({
    value: host.host_id,
    label: `${host.display_name} · ${hostStatusLabels[host.status] ?? host.status}`,
  })),
)
const workspaceOptions = computed(() =>
  sessionStore.workspaces
    .filter((workspace) => workspace.enabled)
    .map((workspace) => ({
      value: workspace.workspace_id,
      label: workspace.default_branch
        ? `${workspace.display_name} · ${workspace.default_branch}`
        : workspace.display_name,
    })),
)

const selectHost = async (hostId: string): Promise<void> => {
  operationError.value = ''
  operationMessage.value = ''
  await sessionStore.selectHost(hostId)
}
const selectWorkspace = (workspaceId: string): void => {
  operationError.value = ''
  operationMessage.value = ''
  sessionStore.selectWorkspace(workspaceId)
}
const openThread = async (threadId: string): Promise<void> => {
  sessionStore.selectThread(threadId)
  await navigateTo(buildCodexTaskRoute(threadId))
}
const createThread = async (): Promise<void> => {
  const previousIds = new Set(
    sessionStore.threads.map((thread) => thread.upstream_thread_id),
  )
  creating.value = true
  operationMessage.value = ''
  operationError.value = ''
  try {
    const operation = await sessionStore.createThread()
    const createdThread = await sessionStore.waitForCreatedThread(previousIds)
    if (createdThread) {
      sessionStore.clearPendingThreadStart()
      await openThread(createdThread.upstream_thread_id)
      return
    }
    operationMessage.value = `线程创建命令 ${operation.command_id} 已受理，正在等待本机快照。`
  } catch (error) {
    const normalized = normalizeApiError(error)
    operationError.value =
      normalized.errorCode === 'codex.host.offline'
        ? 'Codex 主机离线。启动本机 Agent；恢复在线后再次点击会继续同一条创建命令。'
        : normalized.message
    if (normalized.errorCode === 'codex.host.offline') {
      try {
        await sessionStore.loadHosts()
      } catch {
        // 保留原始创建失败提示，刷新状态失败不覆盖用户正在处理的问题。
      }
    }
  } finally {
    creating.value = false
  }
}

onMounted(async () => {
  await sessionStore.loadHosts()
  if (sessionStore.selectedHostId) {
    await sessionStore.selectHost(sessionStore.selectedHostId)
  }
})
</script>
