<template>
  <section
    class="codex-page mx-auto grid w-full min-w-0 max-w-5xl grid-cols-1 gap-5"
  >
    <CodexMobilePageHeader title="项目" />
    <header class="border-b border-line pb-5">
      <h1 class="m-0 text-2xl font-bold">项目</h1>
    </header>
    <div class="rounded-lg border border-line bg-surface p-4 shadow-card">
      <BaseSelect
        :model-value="sessionStore.selectedHostId || ''"
        label="主机"
        :options="hostOptions"
        @update:model-value="sessionStore.selectHost"
      />
    </div>
    <div class="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <article
        v-for="workspace in sessionStore.workspaces"
        :key="workspace.workspace_id"
        class="rounded-lg border border-line bg-surface p-4 shadow-card transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-pop"
      >
        <NuxtLink
          :to="
            buildCodexProjectRoute(workspace.workspace_id, {
              hostId: workspace.host_id,
            })
          "
          class="group flex items-start gap-3 no-underline"
        >
          <span
            class="grid size-9 shrink-0 place-items-center rounded-md border border-line bg-canvas"
          >
            <FolderGit2 class="size-4 text-ink-muted" aria-hidden="true" />
          </span>
          <span class="min-w-0 flex-1">
            <strong class="block truncate text-sm font-medium">{{
              workspace.display_name
            }}</strong>
            <span class="mt-1.5 block text-xs text-ink-muted">
              {{ workspace.default_branch || '未识别分支' }} /
              {{ workspace.enabled ? '可用' : '已停用' }}
            </span>
          </span>
          <ChevronRight
            class="mt-2 size-4 text-ink-muted transition group-hover:translate-x-0.5"
          />
        </NuxtLink>
        <label
          class="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs text-ink-muted"
        >
          <span>隔离工作树</span>
          <input
            type="checkbox"
            :checked="workspace.worktree_policy.enabled"
            aria-label="启用隔离工作树"
            @change="
              toggleIsolation(
                workspace,
                ($event.target as HTMLInputElement).checked,
              )
            "
          />
        </label>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ChevronRight, FolderGit2 } from '@lucide/vue'
import { AuthScope } from '~/types/auth'
import { RuntimeFeatureFlag } from '~/types/app'
import type { CodexWorkspace } from '~/types/codex-workspace'
import { LOGIN_ROUTE, buildCodexProjectRoute } from '~/types/routes'

definePageMeta({
  layout: 'codex',
  requiresAuth: true,
  redirectTo: LOGIN_ROUTE,
  requiredScopes: [AuthScope.CodexRead],
  requiredRuntimeFlag: RuntimeFeatureFlag.Codex,
  title: 'Codex 项目',
})

const sessionStore = useCodexSessionStore()
const hostOptions = computed(() =>
  sessionStore.hosts.map((host) => ({
    value: host.host_id,
    label: host.display_name,
  })),
)

const toggleIsolation = async (
  workspace: CodexWorkspace,
  enabled: boolean,
): Promise<void> => {
  if (
    !enabled &&
    workspace.worktree_policy.enabled &&
    !window.confirm('关闭隔离工作树不会立即删除现有工作树，是否继续？')
  ) {
    return
  }
  await sessionStore.updateWorkspaceIsolation(workspace, enabled)
}

onMounted(async () => {
  await sessionStore.loadHosts()
  if (sessionStore.selectedHostId)
    await sessionStore.selectHost(sessionStore.selectedHostId)
})
</script>
