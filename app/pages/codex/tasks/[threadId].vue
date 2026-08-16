<template>
  <section
    class="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-surface"
  >
    <div
      v-if="pageState !== CodexConversationPageState.Restoring"
      class="min-w-0"
    >
      <CodexConversationHeader
        :active-turn="activeTurn"
        :interrupting="interrupting"
        :compacting="compacting"
        :can-compact="canCompact"
        :can-operate="canOperate"
        @interrupt="interrupt"
        @compact="compact"
      />
      <div
        v-if="hasExecutionOptions"
        class="border-b border-line px-3 py-1.5 sm:px-4"
      >
        <details>
          <summary
            class="flex min-h-8 cursor-pointer list-none items-center gap-2 text-xs text-ink-muted"
          >
            <SlidersHorizontal class="size-3.5" aria-hidden="true" />
            运行配置
          </summary>
          <div
            class="grid grid-cols-1 gap-2 pb-2 sm:grid-cols-2 xl:grid-cols-4"
          >
            <BaseSelect
              v-if="modelOptions.length"
              :model-value="sessionStore.executionOptions.model || ''"
              label="模型"
              :options="modelOptions"
              @update:model-value="
                sessionStore.executionOptions.model = $event || null
              "
            />
            <BaseSelect
              v-if="reasoningOptions.length"
              :model-value="
                sessionStore.executionOptions.reasoning_effort || ''
              "
              label="推理强度"
              :options="reasoningOptions"
              @update:model-value="
                sessionStore.executionOptions.reasoning_effort = $event || null
              "
            />
            <BaseSelect
              v-if="sandboxOptions.length > 1"
              :model-value="sessionStore.executionOptions.sandbox_mode"
              label="沙箱"
              :options="sandboxOptions"
              @update:model-value="
                sessionStore.executionOptions.sandbox_mode =
                  $event as CodexSandboxMode
              "
            />
            <BaseSelect
              v-if="approvalPolicyOptions.length > 1"
              :model-value="sessionStore.executionOptions.approval_policy"
              label="审批策略"
              :options="approvalPolicyOptions"
              @update:model-value="
                sessionStore.executionOptions.approval_policy =
                  $event as CodexApprovalPolicy
              "
            />
          </div>
        </details>
      </div>
    </div>

    <div
      v-if="pageState === CodexConversationPageState.Restoring"
      class="grid min-h-0 place-items-center text-sm text-ink-muted"
      aria-live="polite"
    >
      <span class="inline-flex items-center gap-2">
        <LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
        正在恢复会话
      </span>
    </div>

    <div v-else class="min-h-0 min-w-0 overflow-hidden">
      <div
        v-if="
          pageError || hostUnavailable || stalled || historyWarning || archived
        "
        class="grid gap-2 border-b border-line px-3 py-2 sm:px-4"
      >
        <AppAlert
          v-if="pageError"
          variant="danger"
          title="操作失败"
          :description="pageError"
        />
        <AppAlert
          v-else-if="hostUnavailable"
          variant="warning"
          title="主机离线"
          description="当前显示已持久化会话索引；主机恢复在线后可继续。"
        />
        <AppAlert
          v-else-if="stalled"
          variant="warning"
          title="会话状态等待同步"
          :description="`最后活动时间：${lastActivityLabel}`"
        >
          <BaseButton
            size="sm"
            variant="secondary"
            :disabled="resyncing"
            @click="resync"
          >
            <RefreshCw class="size-3.5" />{{
              resyncing ? '同步中…' : '重新同步'
            }}
          </BaseButton>
        </AppAlert>
        <AppAlert
          v-else-if="archived"
          variant="info"
          title="会话已归档"
          description="恢复会话后才能发送新消息。"
        />
        <AppAlert
          v-else-if="historyWarning"
          variant="info"
          title="部分历史不可用"
          :description="historyWarning"
        />
      </div>

      <div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
        <div
          v-if="pendingApprovals.length"
          class="max-h-[42%] overflow-y-auto border-b border-line p-3 sm:p-4"
        >
          <div class="grid gap-3">
            <CodexApprovalCard
              v-for="approval in pendingApprovals"
              :key="approval.approval_id"
              :approval="approval"
            />
          </div>
        </div>
        <div class="min-h-0 min-w-0 px-2 py-2 sm:px-4">
          <div
            v-if="sessionStore.selectedHistoryCursor"
            class="mb-2 flex justify-center"
          >
            <BaseButton size="sm" variant="secondary" @click="loadMoreHistory">
              加载更早记录
            </BaseButton>
          </div>
          <CodexTimeline
            :items="sessionStore.selectedTimeline"
            :thread-id="threadId"
            :working="showWorkingIndicator"
            @open-context="openTimelineContext"
          />
        </div>
      </div>
    </div>

    <footer
      v-if="pageState !== CodexConversationPageState.Restoring"
      class="min-w-0 border-t border-line bg-surface px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4 sm:pb-3"
    >
      <p
        v-if="sessionStore.selectedPendingTurn"
        class="m-0 pb-1 text-[0.6875rem] text-ink-muted"
        aria-live="polite"
      >
        指令已提交，正在同步会话状态。
      </p>
      <CodexComposer
        v-model="draft"
        :active-turn="activeTurn"
        :submitting="submitting"
        :disabled="hostUnavailable || !canUseTools || archived"
        @submit="send"
      />
    </footer>
  </section>
</template>

<script setup lang="ts">
import { LoaderCircle, RefreshCw, SlidersHorizontal } from '@lucide/vue'
import { AuthScope } from '~/types/auth'
import { RuntimeFeatureFlag } from '~/types/app'
import type { CodexApprovalPolicy } from '~/types/codex-host'
import {
  CODEX_APPROVAL_RESTRICTION_ORDER,
  CODEX_SANDBOX_RESTRICTION_ORDER,
  CodexCapabilityCode,
  CodexHostStatus,
  CodexSandboxMode,
} from '~/types/codex-host'
import { CodexTimelineItemKind } from '~/types/codex-item'
import { CodexThreadHistoryStatus } from '~/types/codex-thread'
import { LOGIN_ROUTE } from '~/types/routes'
import { CodexContextView } from '~/stores/codex-ui'

const STALLED_ACTIVITY_THRESHOLD_MS = 90_000
const ACTIVITY_REFRESH_INTERVAL_MS = 10_000

enum CodexConversationPageState {
  Restoring = 'restoring',
  Empty = 'empty',
  Ready = 'ready',
  Partial = 'partial',
  Failed = 'failed',
}

definePageMeta({
  layout: 'codex',
  requiresAuth: true,
  redirectTo: LOGIN_ROUTE,
  requiredScopes: [AuthScope.CodexRead],
  requiredRuntimeFlag: RuntimeFeatureFlag.Codex,
  title: 'Codex 会话详情',
})

const route = useRoute()
const authStore = useAuthStore()
const sessionStore = useCodexSessionStore()
const realtimeStore = useCodexRealtimeStore()
const approvalStore = useCodexApprovalsStore()
const uiStore = useCodexUiStore()
const threadId = computed(() => String(route.params.threadId || ''))
const thread = computed(() => sessionStore.selectedThread)
const routeHostId = computed(() =>
  typeof route.query.hostId === 'string' ? route.query.hostId : undefined,
)
const routeWorkspaceId = computed(() =>
  typeof route.query.workspaceId === 'string'
    ? route.query.workspaceId
    : undefined,
)
const activeTurn = computed(() => Boolean(thread.value?.active_turn_id))
const archived = computed(() => Boolean(thread.value?.archived))
const pendingApprovals = computed(() =>
  approvalStore.pendingForThread(threadId.value),
)
const canOperate = computed(() => authStore.canScope(AuthScope.CodexOperate))
const canUseTools = computed(
  () =>
    canOperate.value &&
    authStore.canScope(AuthScope.CodexFiles) &&
    authStore.canScope(AuthScope.CodexTerminal),
)
const canCompact = computed(
  () =>
    canOperate.value &&
    Boolean(
      sessionStore.selectedHost?.capabilities.items.some(
        (item) => item.code === CodexCapabilityCode.ThreadCompact,
      ),
    ),
)
const hostUnavailable = computed(
  () => sessionStore.selectedHost?.status !== CodexHostStatus.Online,
)
const submitting = ref(false)
const waitingForTurnStart = ref(false)
const submittedAt = ref<number | null>(null)
const now = ref(Date.now())
const resyncing = ref(false)
const interrupting = ref(false)
const compacting = ref(false)
const pageError = ref('')
const restoring = ref(true)
const draft = computed({
  get: () => uiStore.draftsByThreadId[threadId.value] ?? '',
  set: (value: string) => uiStore.setDraft(threadId.value, value),
})
const lastActivityAt = computed(() => {
  const recencyAt = Date.parse(thread.value?.recency_at || '')
  return Math.max(
    Number.isFinite(recencyAt) ? recencyAt : 0,
    realtimeStore.lastMessageAt ?? 0,
    submittedAt.value ?? 0,
  )
})
const stalled = computed(
  () =>
    lastActivityAt.value > 0 &&
    now.value - lastActivityAt.value > STALLED_ACTIVITY_THRESHOLD_MS &&
    (activeTurn.value || waitingForTurnStart.value),
)
const lastActivityLabel = computed(() =>
  lastActivityAt.value > 0
    ? new Date(lastActivityAt.value).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '尚未收到活动记录',
)
const showWorkingIndicator = computed(
  () => submitting.value || waitingForTurnStart.value || activeTurn.value,
)
const historyWarning = computed(() => {
  if (
    sessionStore.selectedHistoryStatus ===
    CodexThreadHistoryStatus.OmittedTooLarge
  ) {
    return '会话历史超过远程读取上限，完整记录请在本机 Codex 中查看。'
  }
  if (
    sessionStore.selectedHistoryStatus ===
    CodexThreadHistoryStatus.NotAvailableYet
  ) {
    return '会话正文尚未在 App Server 中可读取。'
  }
  return ''
})
const pageState = computed(() => {
  if (restoring.value) return CodexConversationPageState.Restoring
  if (pageError.value) return CodexConversationPageState.Failed
  if (historyWarning.value) return CodexConversationPageState.Partial
  if (
    sessionStore.selectedTimeline.length === 0 &&
    !activeTurn.value &&
    !sessionStore.selectedPendingTurn
  ) {
    return CodexConversationPageState.Empty
  }
  return CodexConversationPageState.Ready
})
const modelOptions = computed(() =>
  (sessionStore.selectedHost?.capabilities.model_ids ?? []).map((value) => ({
    value,
    label: value,
  })),
)
const reasoningOptions = computed(() =>
  (sessionStore.selectedHost?.capabilities.reasoning_efforts ?? []).map(
    (value) => ({ value, label: value }),
  ),
)
const sandboxOptions = computed(() =>
  CODEX_SANDBOX_RESTRICTION_ORDER.filter(
    (mode) =>
      Boolean(
        sessionStore.selectedHost?.capabilities.sandbox_modes.includes(mode),
      ) &&
      (mode !== CodexSandboxMode.DangerFullAccess ||
        authStore.canScope(AuthScope.CodexFullAccess)),
  ).map((value) => ({ value, label: value })),
)
const approvalPolicyOptions = computed(() =>
  CODEX_APPROVAL_RESTRICTION_ORDER.filter((policy) =>
    Boolean(
      sessionStore.selectedHost?.capabilities.approval_policies.includes(
        policy,
      ),
    ),
  ).map((value) => ({ value, label: value })),
)
const hasExecutionOptions = computed(
  () =>
    modelOptions.value.length > 0 ||
    reasoningOptions.value.length > 0 ||
    sandboxOptions.value.length > 1 ||
    approvalPolicyOptions.value.length > 1,
)

const send = async (message: string): Promise<void> => {
  submitting.value = true
  waitingForTurnStart.value = !activeTurn.value
  submittedAt.value = Date.now()
  pageError.value = ''
  try {
    await sessionStore.sendMessage(message)
    uiStore.clearDraft(threadId.value)
  } catch (error) {
    waitingForTurnStart.value = false
    submittedAt.value = null
    pageError.value = error instanceof Error ? error.message : '消息发送失败。'
  } finally {
    submitting.value = false
  }
}

const interrupt = async (): Promise<void> => {
  interrupting.value = true
  waitingForTurnStart.value = false
  pageError.value = ''
  try {
    await sessionStore.interruptTurn()
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : '会话中断失败。'
  } finally {
    interrupting.value = false
  }
}

const compact = async (): Promise<void> => {
  compacting.value = true
  pageError.value = ''
  try {
    await sessionStore.compactThread()
    await sessionStore.loadThreadSnapshot()
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : '会话压缩失败。'
  } finally {
    compacting.value = false
  }
}

const loadMoreHistory = async (): Promise<void> => {
  try {
    await sessionStore.loadMoreHistory()
  } catch (error) {
    pageError.value =
      error instanceof Error ? error.message : '历史记录加载失败。'
  }
}

const resync = async (): Promise<void> => {
  resyncing.value = true
  pageError.value = ''
  try {
    const requests: Promise<void>[] = [sessionStore.refreshAuthority()]
    if (authStore.canScope(AuthScope.CodexApprove))
      requests.push(approvalStore.load())
    await Promise.all(requests)
    now.value = Date.now()
  } catch (error) {
    pageError.value =
      error instanceof Error ? error.message : '会话状态重新同步失败。'
  } finally {
    resyncing.value = false
  }
}

const openTimelineContext = (
  itemId: string,
  kind: CodexTimelineItemKind,
): void => {
  const view =
    kind === CodexTimelineItemKind.Diff
      ? CodexContextView.Changes
      : kind === CodexTimelineItemKind.Command
        ? CodexContextView.Output
        : CodexContextView.Approvals
  uiStore.openContext(view, itemId)
}

watch(activeTurn, (isActive) => {
  if (!isActive) return
  waitingForTurnStart.value = false
  submittedAt.value = null
})

let activityTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  activityTimer = setInterval(() => {
    now.value = Date.now()
  }, ACTIVITY_REFRESH_INTERVAL_MS)
  try {
    const restored = await sessionStore.restoreRouteSelection({
      hostId: routeHostId.value,
      workspaceId: routeWorkspaceId.value,
      threadId: threadId.value,
    })
    if (!restored) {
      throw new Error(sessionStore.selectionError ?? '会话权威归属恢复失败。')
    }
    const requests: Promise<void>[] = [sessionStore.loadThreadSnapshot()]
    if (authStore.canScope(AuthScope.CodexApprove))
      requests.push(approvalStore.load())
    await Promise.all(requests)
  } catch (error) {
    pageError.value =
      error instanceof Error ? error.message : '会话权威状态加载失败。'
  } finally {
    restoring.value = false
  }
})

onBeforeUnmount(() => {
  if (activityTimer) clearInterval(activityTimer)
  uiStore.closeContext()
})
</script>
