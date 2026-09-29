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
        @open-context="openConversationContext"
      />
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

    <div v-else class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div
        v-if="
          pageError ||
          turnFailureMessage ||
          approvalDeliveryStatus ||
          hostUnavailable ||
          stalled ||
          historyWarning ||
          archived
        "
        class="grid shrink-0 gap-2 border-b border-line px-3 py-2 sm:px-4"
      >
        <AppAlert
          v-if="pageError"
          variant="danger"
          title="操作失败"
          :description="pageError"
        />
        <AppAlert
          v-else-if="turnFailureMessage"
          variant="danger"
          title="本轮执行失败"
          :description="turnFailureMessage"
        />
        <AppAlert
          v-else-if="approvalDeliveryStatus"
          :variant="approvalDeliveryStatus.variant"
          :title="approvalDeliveryStatus.title"
          :description="approvalDeliveryStatus.description"
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
          :description="stalledDescription"
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

      <div v-if="pendingApprovals.length" class="shrink-0">
        <CodexApprovalPrompt
          :count="pendingApprovals.length"
          @open="captureApprovalReturnAnchor"
        />
      </div>
      <div class="flex min-h-0 min-w-0 flex-1 flex-col px-2 py-2 sm:px-4">
        <div
          v-if="sessionStore.selectedHistoryCursor"
          class="mb-2 flex shrink-0 justify-center"
        >
          <BaseButton size="sm" variant="secondary" @click="loadMoreHistory">
            加载更早记录
          </BaseButton>
        </div>
        <div class="min-h-0 flex-1">
          <CodexTimeline
            ref="timeline"
            :confirmation-required-operation-ids="
              sessionStore.confirmationRequiredOperationIds
            "
            :items="sessionStore.selectedTimeline"
            :thread-id="threadId"
            :working="showWorkingIndicator"
            :working-label="workingLabel"
            @open-context="openTimelineContext"
            @retry="retryMessage"
            @reload="reloadTimelineBody"
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
        ref="composer"
        v-model="draft"
        :active-turn="activeTurn"
        :submitting="submitting"
        :disabled="composerDisabled"
        :disabled-reason="composerDisabledReason"
        @before-height-change="captureTimelineAnchor"
        @height-change="restoreTimelineAnchor"
        @submit="send"
      />
    </footer>
  </section>
</template>

<script setup lang="ts">
import { LoaderCircle, RefreshCw } from '@lucide/vue'
import { AuthScope } from '~/types/auth'
import { RuntimeFeatureFlag } from '~/types/app'
import { CodexCapabilityCode, CodexHostStatus } from '~/types/codex-host'
import {
  CodexTimelineItemKind,
  CodexTimelineItemStatus,
} from '~/types/codex-item'
import {
  CodexThreadHistoryStatus,
  CodexThreadStatus,
} from '~/types/codex-thread'
import { CodexApprovalState } from '~/types/codex-approval'
import { CodexTurnPhase } from '~/types/codex-turn'
import type { CodexTimelineScrollAnchor } from '~/types/codex-timeline-scroll'
import { buildCodexApprovalsRoute, LOGIN_ROUTE } from '~/types/routes'
import { getCodexTurnSubmissionBlockReason } from '~/stores/codex-session'
import { CodexContextView } from '~/stores/codex-ui'
import {
  readCodexDraftSession,
  writeCodexDraftSession,
  type CodexDraftSessionScope,
} from '~/utils/codex-draft-session'
import { isCodexTurnRuntimeStalled } from '~/utils/codex-turn-runtime'

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
const router = useRouter()
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
const routeContextView = computed<CodexContextView | null>(() => {
  const context = route.query.context
  return Object.values(CodexContextView).includes(context as CodexContextView)
    ? (context as CodexContextView)
    : null
})
const routeContextItemId = computed(() =>
  typeof route.query.contextItem === 'string' ? route.query.contextItem : null,
)
const routeTimelineAnchor = computed<CodexTimelineScrollAnchor | null>(() => {
  const itemId = route.query.timelineAnchorItem
  const offsetText = route.query.timelineAnchorOffset
  if (typeof itemId !== 'string' || typeof offsetText !== 'string') return null
  const offset = Number(offsetText)
  return Number.isFinite(offset) && Math.abs(offset) <= 1_000_000
    ? { itemId, offset }
    : null
})
/** Context 覆盖层关闭后的阅读锚点只写入当前 URL 历史状态，不包含正文或草稿。 */
const routeContextReturnAnchor = computed<CodexTimelineScrollAnchor | null>(
  () => {
    const itemId = route.query.contextAnchorItem
    const offsetText = route.query.contextAnchorOffset
    if (typeof itemId !== 'string' || typeof offsetText !== 'string')
      return null
    const offset = Number(offsetText)
    return Number.isFinite(offset) && Math.abs(offset) <= 1_000_000
      ? { itemId, offset }
      : null
  },
)
const activeTurn = computed(() => Boolean(thread.value?.active_turn_id))
const archived = computed(() => Boolean(thread.value?.archived))
const pendingApprovals = computed(() =>
  approvalStore.pendingForThread(threadId.value),
)
const approvalReturnAnchor = ref<CodexTimelineScrollAnchor | null>(null)
const approvalCenterRoute = computed(() => {
  const query = { ...route.query }
  if (approvalReturnAnchor.value) {
    query.timelineAnchorItem = approvalReturnAnchor.value.itemId
    query.timelineAnchorOffset = String(approvalReturnAnchor.value.offset)
  }
  return buildCodexApprovalsRoute({
    threadId: threadId.value,
    returnTo: router.resolve({ path: route.path, query, hash: route.hash })
      .fullPath,
  })
})
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
const submissionBlockReason = computed(() =>
  getCodexTurnSubmissionBlockReason(realtimeStore.status),
)
const composerDisabled = computed(
  () =>
    hostUnavailable.value ||
    !canUseTools.value ||
    archived.value ||
    Boolean(submissionBlockReason.value),
)
const composerDisabledReason = computed(() => {
  if (submissionBlockReason.value) return submissionBlockReason.value
  if (hostUnavailable.value) return '主机离线，草稿会保留在当前页面。'
  if (archived.value) return '会话已归档，恢复后才能继续发送。'
  return '当前账号没有发送消息所需权限。'
})
const submitting = ref(false)
const waitingForTurnStart = ref(false)
const resyncing = ref(false)
const stalledCheckError = ref('')
const lastCheckedStalledRuntime = ref<string | null>(null)
const interrupting = ref(false)
const compacting = ref(false)
const pageError = ref('')
const restoring = ref(true)
const timeline = ref<{
  captureAnchor: () => CodexTimelineScrollAnchor | null
  onCommit: () => void
  restoreAnchor: () => void
  restoreReadingAnchor: (anchor: CodexTimelineScrollAnchor) => Promise<void>
  visibleItemIds: () => string[]
} | null>(null)
const composer = ref<{ blurInput: () => void } | null>(null)
const draft = computed({
  get: () => uiStore.draftsByThreadId[threadId.value] ?? '',
  set: (value: string) => uiStore.setDraft(threadId.value, value),
})
const draftSessionScope = computed<CodexDraftSessionScope | null>(() => {
  const ownerSubjectId = authStore.principal?.subject_id
  if (!ownerSubjectId || !threadId.value) return null
  return { ownerSubjectId, threadId: threadId.value }
})
const restoredDraftSessionKeys = new Set<string>()
const runtime = computed(() => thread.value?.turn_runtime ?? null)
const latestTurn = computed(() => {
  const turns = Object.values(sessionStore.projection.turnsById).filter(
    (turn) => turn.thread_id === threadId.value,
  )
  return turns.sort((left, right) => {
    const leftAt = left.completed_at ?? left.started_at ?? ''
    const rightAt = right.completed_at ?? right.started_at ?? ''
    return (
      rightAt.localeCompare(leftAt) || right.turn_id.localeCompare(left.turn_id)
    )
  })[0]
})
const turnFailureMessage = computed(() => {
  if (thread.value?.status !== CodexThreadStatus.Failed) return ''
  return latestTurn.value?.error_message || '本轮执行失败，请查看时间线后重试。'
})
const approvalDeliveryStatus = computed<{
  variant: 'warning' | 'danger'
  title: string
  description: string
} | null>(() => {
  const approvals = Object.values(approvalStore.approvalsById)
    .filter(
      (approval) =>
        approval.thread_id === threadId.value &&
        (approval.state === CodexApprovalState.Claimed ||
          approval.state === CodexApprovalState.DeliveryFailed),
    )
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
  const approval = approvals[0]
  if (!approval) return null
  if (approval.state === CodexApprovalState.DeliveryFailed) {
    return {
      variant: 'danger',
      title: '审批交付失败',
      description: 'Agent 尚未收到该审批结果，请在审批中心核对后重试。',
    }
  }
  return {
    variant: 'warning',
    title: '审批正在交付',
    description: '审批结果已提交，正在等待 Agent 确认应用。',
  }
})
const stalled = computed(() => isCodexTurnRuntimeStalled(runtime.value))
const lastActivityLabel = computed(() =>
  runtime.value?.last_activity_at
    ? new Date(runtime.value.last_activity_at).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '尚未收到活动记录',
)
const stalledDescription = computed(() => {
  if (resyncing.value) return '长时间未收到实际任务进展，正在核对当前权威状态。'
  if (stalledCheckError.value) {
    return `未能确认当前状态：${stalledCheckError.value}。现有文件结果仍可查看。`
  }
  return `长时间未收到实际任务进展，最后活动时间：${lastActivityLabel.value}`
})
const hasCompletedFileChange = computed(() =>
  sessionStore.selectedTimeline.some(
    (item) =>
      item.detail.kind === CodexTimelineItemKind.Diff &&
      item.header.status === CodexTimelineItemStatus.Completed,
  ),
)
const workingLabel = computed(() => {
  if (sessionStore.selectedPendingTurn && !activeTurn.value)
    return '指令已提交，正在准备'
  if (runtime.value?.phase === CodexTurnPhase.AwaitingApproval)
    return '等待审批'
  if (runtime.value?.phase === CodexTurnPhase.Stalled) return '正在核对会话状态'
  if (activeTurn.value && hasCompletedFileChange.value)
    return '变更已应用，仍在执行'
  if (activeTurn.value) return '正在执行'
  return '正在处理'
})
const showWorkingIndicator = computed(
  () => submitting.value || waitingForTurnStart.value || activeTurn.value,
)

/** 详情页与列表页共享筛选查询参数，统一由 session action 隔离旧请求和恢复。 */
const applyRouteFilters = async (reload: boolean): Promise<void> => {
  const searchTerm =
    typeof route.query.search === 'string' ? route.query.search.trim() : ''
  const showArchived = route.query.archived === 'true'
  await sessionStore.applyRouteFilters({ searchTerm, showArchived, reload })
}
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
const send = async (message: string): Promise<void> => {
  submitting.value = true
  waitingForTurnStart.value = !activeTurn.value
  pageError.value = ''
  try {
    await sessionStore.sendMessage(message)
    uiStore.clearDraft(threadId.value)
    // 仅在服务端受理后失焦，避免失败时意外收起 Android 软键盘。
    composer.value?.blurInput()
  } catch (error) {
    waitingForTurnStart.value = false
    pageError.value = error instanceof Error ? error.message : '消息发送失败。'
  } finally {
    submitting.value = false
  }
}

const captureTimelineAnchor = (): void => {
  timeline.value?.captureAnchor()
}

/** 审批页返回地址只携带阅读锚点，不携带正文、草稿或权限数据。 */
const captureApprovalReturnAnchor = (): void => {
  approvalReturnAnchor.value = timeline.value?.captureAnchor() ?? null
  void navigateTo(approvalCenterRoute.value)
}

/** 返回会话后清理 URL 中的一次性锚点，避免后续刷新重复恢复旧阅读位置。 */
const restoreApprovalReturnAnchor = async (): Promise<void> => {
  const anchor = routeTimelineAnchor.value
  if (!anchor) return
  await nextTick()
  await timeline.value?.restoreReadingAnchor(anchor)
  const query = { ...route.query }
  delete query.timelineAnchorItem
  delete query.timelineAnchorOffset
  await router.replace({ path: route.path, query, hash: route.hash })
}

/** Context 关闭后沿用统一滚动控制器恢复阅读位置，并清理一次性 URL 锚点。 */
const restoreContextReturnAnchor = async (): Promise<void> => {
  const anchor = routeContextReturnAnchor.value
  if (!anchor) return
  await nextTick()
  await timeline.value?.restoreReadingAnchor(anchor)
  const query = { ...route.query }
  delete query.contextAnchorItem
  delete query.contextAnchorOffset
  await router.replace({ path: route.path, query, hash: route.hash })
}

const restoreTimelineAnchor = (): void => {
  void nextTick(() => {
    timeline.value?.restoreAnchor()
    timeline.value?.onCommit()
  })
}

const retryMessage = async (clientOperationId: string): Promise<void> => {
  submitting.value = true
  pageError.value = ''
  try {
    await sessionStore.retryMessage(clientOperationId)
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : '消息重试失败。'
  } finally {
    submitting.value = false
  }
}

const reloadTimelineBody = async (itemId: string): Promise<void> => {
  timeline.value?.captureAnchor()
  pageError.value = ''
  try {
    await sessionStore.reloadTimelineBody(itemId)
    await nextTick()
    timeline.value?.onCommit()
  } catch (error) {
    pageError.value =
      error instanceof Error ? error.message : '已回收内容重新加载失败。'
  }
}

watch(
  draftSessionScope,
  (scope) => {
    if (!import.meta.client || !scope) return
    const key = `${scope.ownerSubjectId}:${scope.threadId}`
    if (restoredDraftSessionKeys.has(key)) return
    restoredDraftSessionKeys.add(key)
    const restoredDraft = readCodexDraftSession(window.sessionStorage, scope)
    if (restoredDraft && !draft.value)
      uiStore.setDraft(scope.threadId, restoredDraft)
  },
  { immediate: true },
)

watch(draft, (value) => {
  if (!import.meta.client || !draftSessionScope.value) return
  const scope = draftSessionScope.value
  const key = `${scope.ownerSubjectId}:${scope.threadId}`
  if (!restoredDraftSessionKeys.has(key)) return
  writeCodexDraftSession(window.sessionStorage, scope, value)
})

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
  // prepend 会把新内容插入可见项之前；先交给唯一滚动控制器捕获锚点，随后由它的
  // RAF 测量队列恢复，避免页面层与虚拟列表竞争 scrollTop。
  timeline.value?.captureAnchor()
  try {
    await sessionStore.loadMoreHistory()
    await nextTick()
    timeline.value?.onCommit()
  } catch (error) {
    pageError.value =
      error instanceof Error ? error.message : '历史记录加载失败。'
  }
}

watch(
  () => sessionStore.selectedTimeline,
  async () => {
    await nextTick()
    sessionStore.evictTimelineBodies(timeline.value?.visibleItemIds() ?? [])
  },
  { flush: 'post' },
)

const resync = async (): Promise<void> => {
  if (resyncing.value) return
  resyncing.value = true
  pageError.value = ''
  stalledCheckError.value = ''
  try {
    const requests: Promise<void>[] = [sessionStore.refreshAuthority()]
    if (authStore.canScope(AuthScope.CodexApprove))
      requests.push(approvalStore.load())
    await Promise.all(requests)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '会话状态重新同步失败。'
    if (stalled.value) stalledCheckError.value = message
    else pageError.value = message
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
  openContextRoute(view, itemId)
}

const openConversationContext = (view: CodexContextView): void => {
  openContextRoute(view)
}

/** 上下文面板状态由 URL 承载，刷新和浏览器前进/后退后仍可恢复当前对象。 */
const openContextRoute = (
  view: CodexContextView,
  selectedItemId: string | null = null,
): void => {
  const returnAnchor = timeline.value?.captureAnchor()
  uiStore.openContext(view, selectedItemId)
  const query: Record<string, string | string[] | undefined> = {
    ...route.query,
    context: view,
  }
  if (selectedItemId) query.contextItem = selectedItemId
  else delete query.contextItem
  if (returnAnchor) {
    query.contextAnchorItem = returnAnchor.itemId
    query.contextAnchorOffset = String(returnAnchor.offset)
  } else {
    delete query.contextAnchorItem
    delete query.contextAnchorOffset
  }
  void navigateTo(
    { path: route.path, query, hash: route.hash },
    { replace: true },
  )
}

watch(
  [routeContextView, routeContextItemId],
  ([view, itemId], [previousView]) => {
    if (view) {
      uiStore.openContext(view, itemId)
      return
    }
    uiStore.closeContext()
    if (previousView) void restoreContextReturnAnchor()
  },
  { immediate: true },
)

watch(
  [() => route.query.search, () => route.query.archived],
  () => void applyRouteFilters(true),
)

watch(
  [
    activeTurn,
    () => sessionStore.selectedPendingTurn,
    () => runtime.value?.phase,
  ],
  ([isActive, pendingTurn, phase]) => {
    if (
      isActive ||
      !pendingTurn ||
      phase === 'completed' ||
      phase === 'failed' ||
      phase === 'interrupted'
    ) {
      waitingForTurnStart.value = false
    }
  },
)

watch(
  [
    stalled,
    () => runtime.value?.turn_id,
    () => runtime.value?.last_activity_at,
    () => runtime.value?.lease_generation,
  ],
  ([isStalled, turnId, lastActivityAt, leaseGeneration]) => {
    if (
      !isStalled ||
      !turnId ||
      !lastActivityAt ||
      leaseGeneration === undefined
    )
      return
    const key = [threadId.value, turnId, lastActivityAt, leaseGeneration].join(
      ':',
    )
    if (lastCheckedStalledRuntime.value === key) return
    lastCheckedStalledRuntime.value = key
    void resync()
  },
  { immediate: true },
)

onMounted(async () => {
  try {
    await applyRouteFilters(false)
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
  await restoreApprovalReturnAnchor()
})

onBeforeUnmount(() => {
  uiStore.closeContext()
})
</script>
