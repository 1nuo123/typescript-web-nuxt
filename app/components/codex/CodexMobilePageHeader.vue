<template>
  <header
    class="-mx-4 -mt-4 mb-4 flex min-h-14 items-center gap-3 border-b border-line bg-surface px-3 pt-[env(safe-area-inset-top)]"
  >
    <NuxtLink
      :to="backRoute"
      class="grid size-9 shrink-0 place-items-center rounded-md text-ink-muted no-underline hover:bg-surface-muted hover:text-ink"
      title="返回 Remote"
      aria-label="返回 Remote"
    >
      <ArrowLeft class="size-4" aria-hidden="true" />
    </NuxtLink>
    <div class="min-w-0">
      <strong class="block truncate text-sm">Remote</strong>
      <span class="block truncate text-xs text-ink-muted">{{ title }}</span>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import { buildCodexTaskRoute, buildCodexTasksRoute } from '~/types/routes'

defineProps<{
  title: string
}>()

const sessionStore = useCodexSessionStore()
const route = useRoute()
const backRoute = computed(() => {
  const returnTo = route.query.returnTo
  if (typeof returnTo === 'string' && returnTo.startsWith('/codex/tasks/') && !returnTo.includes('\\')) return returnTo
  const thread = sessionStore.selectedThread
  if (thread) {
    return buildCodexTaskRoute(thread.upstream_thread_id, {
      hostId: thread.host_id,
      workspaceId: thread.workspace_id,
    })
  }
  return buildCodexTasksRoute({
    hostId: sessionStore.selectedHostId ?? undefined,
    workspaceId: sessionStore.selectedWorkspaceId ?? undefined,
  })
})
</script>
