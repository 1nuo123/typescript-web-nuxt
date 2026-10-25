<template>
  <CodexMobileRemoteNavigator v-if="isMobile" />
  <section
    v-else
    class="codex-welcome grid h-full min-h-0 min-w-0 place-items-center overflow-y-auto p-6"
  >
    <AppAlert
      v-if="pageError"
      variant="danger"
      title="会话加载失败"
      :description="pageError"
      class="w-full max-w-xl"
    />
    <div
      v-else
      class="grid w-full max-w-lg justify-items-center gap-6 text-center"
    >
      <span
        class="grid size-14 place-items-center rounded-2xl bg-canvas text-ink-muted"
      >
        <FolderGit2 class="size-5" aria-hidden="true" />
      </span>
      <div class="min-w-0">
        <h1 class="m-0 truncate text-2xl font-medium tracking-tight">
          {{ sessionStore.selectedWorkspace?.display_name || '未选择项目' }}
        </h1>
        <p class="mt-1 mb-0 text-sm text-ink-muted">
          {{
            sessionStore.selectedWorkspace?.default_branch ||
            '选择项目，开始新的工作'
          }}
        </p>
      </div>
      <dl
        v-if="sessionStore.selectedWorkspace"
        class="m-0 grid w-full grid-cols-2 gap-x-8 gap-y-1 rounded-2xl border border-line px-6 py-5 text-xs"
      >
        <div>
          <dt class="text-ink-muted">活动会话</dt>
          <dd class="m-0 mt-0.5 font-medium">
            {{ sessionStore.threads.length }}
          </dd>
        </div>
        <div>
          <dt class="text-ink-muted">主机</dt>
          <dd class="m-0 mt-0.5 font-medium">
            {{ sessionStore.selectedHost?.display_name || '离线' }}
          </dd>
        </div>
      </dl>
    </div>
  </section>
</template>

<script setup lang="ts">
import { FolderGit2 } from '@lucide/vue'
import { AuthScope } from '~/types/auth'
import { RuntimeFeatureFlag } from '~/types/app'
import { LOGIN_ROUTE } from '~/types/routes'

definePageMeta({
  layout: 'codex',
  requiresAuth: true,
  redirectTo: LOGIN_ROUTE,
  requiredScopes: [AuthScope.CodexRead],
  requiredRuntimeFlag: RuntimeFeatureFlag.Codex,
  title: 'Codex 会话',
})

const sessionStore = useCodexSessionStore()
const route = useRoute()
const { isMobile } = useBreakpoints()
const pageError = ref('')

/** 路由查询是筛选事实源，统一交给 session action 处理请求隔离和恢复失效。 */
const applyRouteFilters = async (reload: boolean): Promise<void> => {
  const searchTerm =
    typeof route.query.search === 'string' ? route.query.search.trim() : ''
  const showArchived = route.query.archived === 'true'
  await sessionStore.applyRouteFilters({ searchTerm, showArchived, reload })
}

watch(
  [() => route.query.search, () => route.query.archived],
  () => void applyRouteFilters(true),
)

onMounted(async () => {
  await nextTick()
  if (isMobile.value) return
  try {
    await applyRouteFilters(false)
    const hostId =
      typeof route.query.hostId === 'string' ? route.query.hostId : undefined
    const workspaceId =
      typeof route.query.workspaceId === 'string'
        ? route.query.workspaceId
        : undefined
    const restored = await sessionStore.restoreRouteSelection({
      hostId,
      workspaceId,
    })
    // A valid host may still be publishing its first workspace snapshot.
    // Only an explicitly requested missing identity is a route failure.
    if (!restored && (workspaceId || !sessionStore.selectedHostId)) {
      throw new Error(sessionStore.selectionError ?? '项目权威归属恢复失败。')
    }
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : '会话加载失败。'
  }
})
</script>
