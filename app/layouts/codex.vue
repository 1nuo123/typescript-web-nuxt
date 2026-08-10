<template>
  <div class="min-h-dvh min-w-0 max-w-full overflow-x-clip bg-canvas text-ink">
    <CodexConnectionBanner
      :status="status"
      :reconnect-attempt="reconnectAttempt"
      :error="lastError"
    />

    <aside
      class="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-elevated lg:flex"
      aria-label="Codex 工作区导航"
    >
      <div class="flex h-16 items-center gap-3 border-b border-line px-4">
        <div
          class="grid size-9 place-items-center rounded-md bg-primary text-canvas shadow-[0_4px_12px_color-mix(in_srgb,var(--ui-primary)_22%,transparent)]"
          aria-hidden="true"
        >
          <TerminalSquare class="size-[1.125rem]" />
        </div>
        <div class="min-w-0">
          <NuxtLink
            :to="CODEX_TASKS_ROUTE"
            class="block truncate text-[0.9rem] font-bold no-underline"
          >
            Codex Remote
          </NuxtLink>
          <span class="block text-[0.6875rem] text-ink-muted">远程工作台</span>
        </div>
      </div>

      <div class="grid gap-4 overflow-y-auto px-3 py-4">
        <NuxtLink
          :to="CODEX_TASKS_ROUTE"
          class="flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-canvas no-underline shadow-[0_4px_12px_color-mix(in_srgb,var(--ui-primary)_18%,transparent)] transition-colors hover:bg-primary-strong"
        >
          <SquarePen class="size-4" aria-hidden="true" />
          新建任务
        </NuxtLink>

        <nav class="grid gap-1" aria-label="Codex 主导航">
          <template v-for="item in navigationItems" :key="item.to">
            <span
              v-if="item.disabled"
              class="flex min-h-9 items-center gap-3 rounded-md px-3 text-sm text-ink-muted opacity-45"
            >
              <component :is="navigationIcon(item.label)" class="size-4" />
              {{ item.label }}
            </span>
            <NuxtLink
              v-else
              :to="item.to"
              class="flex min-h-10 items-center gap-3 rounded-md border border-transparent px-3 text-[0.85rem] font-medium text-ink-muted no-underline transition-colors hover:bg-surface-muted hover:text-ink"
              active-class="!border-primary/15 !bg-primary-soft !font-semibold !text-primary-strong"
            >
              <component :is="navigationIcon(item.label)" class="size-4" />
              {{ item.label }}
            </NuxtLink>
          </template>
        </nav>

        <div v-if="recentThreads.length" class="grid gap-1">
          <p
            class="m-0 px-3 text-[0.6875rem] font-semibold text-ink-muted uppercase"
          >
            最近任务
          </p>
          <NuxtLink
            v-for="thread in recentThreads"
            :key="thread.upstream_thread_id"
            :to="buildCodexTaskRoute(thread.upstream_thread_id)"
            class="block truncate rounded-md px-3 py-2 text-xs text-ink-muted no-underline transition-colors hover:bg-surface-muted hover:text-ink"
            active-class="bg-primary-soft !text-primary-strong"
          >
            {{ thread.display_name || '未命名任务' }}
          </NuxtLink>
        </div>
      </div>

      <div class="mt-auto border-t border-line p-3">
        <CodexHostBadge
          v-if="sessionStore.selectedHost"
          :host="sessionStore.selectedHost"
          class="w-full"
        />
        <p v-else class="m-0 px-2 py-1 text-xs text-ink-muted">尚未连接主机</p>
      </div>
    </aside>

    <div class="min-h-dvh min-w-0 max-w-full overflow-x-clip lg:pl-60">
      <header
        class="sticky top-0 z-20 flex min-h-14 min-w-0 max-w-full items-center justify-between gap-3 overflow-hidden border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden"
      >
        <NuxtLink
          :to="CODEX_TASKS_ROUTE"
          class="flex min-w-0 items-center gap-2 font-semibold no-underline"
        >
          <span
            class="grid size-8 place-items-center rounded-md bg-primary text-canvas"
          >
            <TerminalSquare class="size-4" aria-hidden="true" />
          </span>
          <span class="truncate">Codex Remote</span>
        </NuxtLink>
        <CodexHostBadge
          v-if="sessionStore.selectedHost"
          :host="sessionStore.selectedHost"
          compact
          class="max-w-[52%] shrink"
        />
      </header>

      <main
        class="min-h-[calc(100dvh-3.5rem)] min-w-0 max-w-full touch-pan-y overflow-x-clip px-4 py-5 pb-24 sm:px-5 lg:h-dvh lg:min-h-0 lg:overflow-y-auto lg:px-8 lg:py-6 lg:pb-6"
      >
        <slot />
      </main>
    </div>

    <nav
      class="fixed inset-x-0 bottom-0 z-30 max-w-full touch-pan-y overflow-x-clip border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      aria-label="Codex 主导航"
    >
      <div class="mx-auto grid max-w-xl" :style="mobileNavigationGridStyle">
        <template v-for="item in navigationItems" :key="item.to">
          <span
            v-if="item.disabled"
            class="grid min-h-14 place-items-center px-2 py-2 text-[0.6875rem] text-ink-muted opacity-45"
          >
            <component :is="navigationIcon(item.label)" class="size-5" />
            <span>{{ item.label }}</span>
          </span>
          <NuxtLink
            v-else
            :to="item.to"
            class="grid min-h-14 place-items-center px-2 py-2 text-[0.6875rem] font-medium text-ink-muted no-underline"
            active-class="text-primary"
          >
            <component :is="navigationIcon(item.label)" class="size-5" />
            <span>{{ item.label }}</span>
          </NuxtLink>
        </template>
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
import {
  FolderGit2,
  ListTodo,
  Settings2,
  ShieldCheck,
  SquarePen,
  TerminalSquare,
} from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { AuthSessionStatus } from '~/types/auth'
import { CODEX_TASKS_ROUTE, buildCodexTaskRoute } from '~/types/routes'
import { CODEX_NAVIGATION_ITEMS } from '~/utils/codex-routes'

const authStore = useAuthStore()
const sessionStore = useCodexSessionStore()
const realtimeStore = useCodexRealtimeStore()
const approvalsStore = useCodexApprovalsStore()
const uiStore = useCodexUiStore()
const { status, reconnectAttempt, lastError } = storeToRefs(realtimeStore)
const navigationItems = computed(() =>
  authStore.filterNavigationItems(CODEX_NAVIGATION_ITEMS),
)
const recentThreads = computed(() => sessionStore.threads.slice(0, 7))
const mobileNavigationGridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${Math.max(navigationItems.value.length, 1)}, minmax(0, 1fr))`,
}))
const navigationIcon = (label: string) => {
  const icons = {
    任务: ListTodo,
    审批: ShieldCheck,
    项目: FolderGit2,
    设置: Settings2,
  }
  return icons[label as keyof typeof icons] ?? ListTodo
}

if (import.meta.client) useCodexRealtime()

watch(
  () => authStore.isAuthenticated,
  (authenticated) => {
    const terminalStatuses = [
      AuthSessionStatus.Anonymous,
      AuthSessionStatus.Disabled,
      AuthSessionStatus.Forbidden,
      AuthSessionStatus.Revoked,
      AuthSessionStatus.Reused,
    ]
    if (!authenticated && terminalStatuses.includes(authStore.status)) {
      sessionStore.clearSession()
      realtimeStore.clearRealtime()
      approvalsStore.clear()
      uiStore.clearUi()
    }
  },
)
</script>
