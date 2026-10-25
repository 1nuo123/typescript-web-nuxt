<template>
  <div
    class="codex-surface codex-shell h-dvh min-h-dvh min-w-0 overflow-hidden bg-canvas text-ink"
  >
    <CodexConnectionBanner
      :history-status="realtimeStore.historyStatus"
      :status="status"
      :reconnect-attempt="reconnectAttempt"
      :error="lastError"
      :last-close="lastClose"
    />

    <div
      v-if="isMobile"
      class="h-dvh min-h-0 min-w-0 overflow-hidden bg-surface"
    >
      <slot />
      <CodexContextPanel v-if="uiStore.contextPanelOpen" />
    </div>

    <div
      v-else
      class="codex-desktop grid h-dvh min-h-0 min-w-0 overflow-hidden"
      :class="{
        'codex-desktop--focused': uiStore.navigationCollapsed,
        'codex-desktop--context': uiStore.contextPanelOpen && width >= 1280,
      }"
    >
      <CodexProjectRail
        v-show="!uiStore.navigationCollapsed"
        id="codex-navigation"
      >
        <CodexConversationSidebar />
      </CodexProjectRail>
      <main
        class="codex-main relative min-h-0 min-w-0 overflow-hidden bg-surface"
      >
        <button
          type="button"
          class="codex-navigation-toggle"
          :aria-expanded="!uiStore.navigationCollapsed"
          aria-controls="codex-navigation"
          :aria-label="uiStore.navigationCollapsed ? '展开导航' : '收起导航'"
          :title="uiStore.navigationCollapsed ? '展开导航' : '收起导航'"
          @click="uiStore.toggleNavigation()"
        >
          <PanelLeft class="size-4" aria-hidden="true" />
        </button>
        <slot />
      </main>
      <CodexContextPanel v-if="uiStore.contextPanelOpen" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { PanelLeft } from '@lucide/vue'
import { UI_SURFACE_CLASS } from '~/utils/ui-surface'

import { AuthScope, AuthSessionStatus } from '~/types/auth'

provide(UI_SURFACE_CLASS, 'codex-surface')

const authStore = useAuthStore()
const sessionStore = useCodexSessionStore()
const realtimeStore = useCodexRealtimeStore()
const approvalsStore = useCodexApprovalsStore()
const uiStore = useCodexUiStore()
const experienceFlags = useCodexExperienceFeatureFlags()
const { status, reconnectAttempt, lastError, lastClose } =
  storeToRefs(realtimeStore)
const { width, isMobile } = useBreakpoints()

if (import.meta.client) useCodexRealtime()

onMounted(async () => {
  if (authStore.canScope(AuthScope.CodexApprove)) {
    void approvalsStore.load().catch((error) => {
      useClientLogger().capture(error, {
        code: 'codex.approvals.initial_load_failed',
      })
    })
  }
  if (!sessionStore.hosts.length) {
    await sessionStore.loadHosts().catch((error) => {
      useClientLogger().capture(error, {
        code: 'codex.navigation.initial_load_failed',
      })
    })
  }
})

watch(
  () => sessionStore.selectedHostId,
  (current, previous) => {
    if (previous && current !== previous) uiStore.clearTransientUi()
  },
)

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
      experienceFlags.reset()
      uiStore.clearUi()
    }
  },
)
</script>
