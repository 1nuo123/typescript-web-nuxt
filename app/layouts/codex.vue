<template>
  <div class="h-dvh min-h-dvh min-w-0 overflow-hidden bg-canvas text-ink">
    <CodexConnectionBanner
      :status="status"
      :reconnect-attempt="reconnectAttempt"
      :error="lastError"
      :last-close="lastClose"
    />

    <div v-if="isMobile" class="h-dvh min-h-0 min-w-0 overflow-hidden">
      <slot />
      <CodexContextPanel v-if="uiStore.contextPanelOpen" />
    </div>

    <div
      v-else
      class="grid h-dvh min-h-0 min-w-0 overflow-hidden"
      :class="desktopGridClass"
    >
      <CodexProjectRail />
      <CodexConversationSidebar />
      <main class="min-h-0 min-w-0 overflow-hidden bg-surface">
        <slot />
      </main>
      <CodexContextPanel v-if="uiStore.contextPanelOpen" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { AuthScope, AuthSessionStatus } from '~/types/auth'

const authStore = useAuthStore()
const sessionStore = useCodexSessionStore()
const realtimeStore = useCodexRealtimeStore()
const approvalsStore = useCodexApprovalsStore()
const uiStore = useCodexUiStore()
const experienceFlags = useCodexExperienceFeatureFlags()
const { status, reconnectAttempt, lastError, lastClose } = storeToRefs(realtimeStore)
const { width, isMobile } = useBreakpoints()

const desktopGridClass = computed(() =>
  uiStore.contextPanelOpen && width.value >= 1280
    ? 'grid-cols-[minmax(9.5rem,0.65fr)_minmax(13rem,0.9fr)_minmax(0,2.2fr)_minmax(19rem,1fr)]'
    : 'grid-cols-[minmax(9.5rem,0.65fr)_minmax(13rem,0.9fr)_minmax(0,2.2fr)]',
)

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
