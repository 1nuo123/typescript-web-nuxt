<template>
  <section class="mx-auto grid w-full min-w-0 max-w-3xl grid-cols-1 gap-6">
    <header
      class="flex items-start justify-between gap-4 border-b border-line pb-5"
    >
      <div class="min-w-0">
        <NuxtLink
          :to="CODEX_PROJECTS_ROUTE"
          class="inline-flex items-center gap-1 text-xs text-ink-muted no-underline hover:text-ink"
        >
          <ChevronLeft class="size-3.5" aria-hidden="true" />
          所有项目
        </NuxtLink>
        <h1 class="mt-2 mb-0 truncate text-xl font-semibold">
          {{ workspace?.display_name || '项目' }}
        </h1>
      </div>
      <BaseButton v-if="workspace" size="sm" @click="openTasks">
        <ListTodo class="size-4" aria-hidden="true" />
        查看任务
      </BaseButton>
    </header>
    <div
      v-if="workspace"
      class="divide-y divide-line rounded-lg border border-line bg-surface"
    >
      <div class="flex items-center justify-between gap-4 px-4 py-3.5 text-sm">
        <span class="text-ink-muted">本地键</span>
        <code class="truncate text-xs">{{
          workspace.agent_workspace_key
        }}</code>
      </div>
      <div class="flex items-center justify-between gap-4 px-4 py-3.5 text-sm">
        <span class="text-ink-muted">默认分支</span>
        <span>{{ workspace.default_branch || '未知' }}</span>
      </div>
      <div class="flex items-center justify-between gap-4 px-4 py-3.5 text-sm">
        <span class="text-ink-muted">状态</span>
        <span class="inline-flex items-center gap-1.5">
          <span
            class="size-1.5 rounded-full"
            :class="workspace.enabled ? 'bg-accent' : 'bg-danger'"
          />
          {{ workspace.enabled ? '可用' : '停用' }}
        </span>
      </div>
    </div>
    <AppSkeleton v-else class="h-48" />
  </section>
</template>

<script setup lang="ts">
import { ChevronLeft, ListTodo } from '@lucide/vue'
import { AuthScope } from '~/types/auth'
import { RuntimeFeatureFlag } from '~/types/app'
import {
  LOGIN_ROUTE,
  CODEX_PROJECTS_ROUTE,
  CODEX_TASKS_ROUTE,
} from '~/types/routes'

definePageMeta({
  layout: 'codex',
  requiresAuth: true,
  redirectTo: LOGIN_ROUTE,
  requiredScopes: [AuthScope.CodexRead],
  requiredRuntimeFlag: RuntimeFeatureFlag.Codex,
  title: 'Codex 项目详情',
})

const route = useRoute()
const sessionStore = useCodexSessionStore()
const workspaceId = computed(() => String(route.params.workspaceId || ''))
const workspace = computed(
  () => sessionStore.projection.workspacesById[workspaceId.value] ?? null,
)
const openTasks = async (): Promise<void> => {
  sessionStore.selectWorkspace(workspaceId.value)
  await navigateTo(CODEX_TASKS_ROUTE)
}

onMounted(async () => {
  await sessionStore.refreshAuthority()
  if (workspace.value) sessionStore.selectWorkspace(workspaceId.value)
})
</script>
