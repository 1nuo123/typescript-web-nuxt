import { defineStore } from 'pinia'
import type { ApiErrorPayload } from '~/types/api'
import {
  CodexApprovalPolicy,
  CodexHostStatus,
  CodexSandboxMode,
  type CodexHost,
} from '~/types/codex-host'
import {
  CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
  CodexTimelineItemKind,
  CodexTimelineItemSource,
  CodexTimelineItemStatus,
  type CodexTextTimelineItem,
  type CodexTimelineRenderableItem,
} from '~/types/codex-item'
import {
  CODEX_REALTIME_SCHEMA_VERSION,
  CODEX_REALTIME_STREAM_EPOCH,
  CodexRealtimeEventType,
  type CodexRealtimeConnectionStatus,
  type CodexRealtimeEvent,
} from '~/types/codex-realtime'
import {
  type CodexExecutionOptions,
  type CodexThread,
  CodexThreadHistoryStatus,
} from '~/types/codex-thread'
import type { CodexOperationAccepted } from '~/types/codex-turn'
import {
  WorkspaceSelectionState,
  type CodexWorkspace,
  type CodexWorkspaceExecutionPreferences,
  type CodexWorkspaceExecutionPreferencesResult,
  type CodexWorkspaceExecutionPreferencesUpdate,
} from '~/types/codex-workspace'
import type { CodexTaskRoute } from '~/types/routes'
import { createCodexIdempotencyKey } from '~/services/api/codex-api-client'
import { waitForCodexOperation } from '~/services/api/codex-operations'
import {
  createCodexSessionProjection,
  codexItemKey,
  evictCodexTimelineBodies,
  prependCodexHistoryPage,
  reduceCodexRealtimeBatch,
  replaceCodexTimelineItem,
  replaceCodexHosts,
  replaceCodexThreadsForQuery,
  replaceCodexWorkspacesForHost,
  restoreCodexTimelineBodies,
  upsertCodexTimelineItem,
  type CodexSessionProjection,
} from '~/utils/codex-event-reducer'
import { getFullyCoveredTerminalTurnIds } from '~/utils/codex-snapshot-coverage'
import { validateCodexRealtimeEvent } from '~/utils/codex-event-validator'
import { getCodexRealtimeWriteBlockReason } from '~/utils/codex-realtime-write-guard'

interface PendingCodexThreadStart {
  requestKey: string
  idempotencyKey: string
  operation: CodexOperationAccepted | null
}

/** 内存中的失败发送记录；只用于用户明确重试，绝不建立离线自动队列。 */
interface FailedCodexTurnSubmission {
  clientOperationId: string
  hostId: string
  threadId: string
  message: string
  execution: CodexExecutionOptions
  activeTurn: boolean
}

interface CodexInFlightLoad {
  key: string
  promise: Promise<void>
  signal?: AbortSignal
}

let hostsLoadInFlight: Promise<void> | null = null
let workspacesLoadInFlight: CodexInFlightLoad | null = null
let threadsLoadInFlight: CodexInFlightLoad | null = null
let authorityRefreshInFlight: CodexInFlightLoad | null = null
let historyLoadInFlight: CodexInFlightLoad | null = null
let snapshotLoadInFlight: CodexInFlightLoad | null = null
let sessionLoadGeneration = 0

interface CodexSessionStoreState {
  projection: CodexSessionProjection
  selectedHostId: string | null
  selectedWorkspaceId: string | null
  selectedThreadId: string | null
  workspaceSelectionState: WorkspaceSelectionState
  selectionError: string | null
  loading: boolean
  pendingTurnByThreadId: Record<string, CodexOperationAccepted>
  failedTurnByOperationId: Record<string, FailedCodexTurnSubmission>
  confirmationRequiredOperationIds: string[]
  pendingThreadStart: PendingCodexThreadStart | null
  resumedThreadIds: string[]
  lastError: ApiErrorPayload | null
  threadSearchTerm: string
  showArchivedThreads: boolean
  threadNextCursor: string | null
  threadLoadRequestId: number
  snapshotRecoveryInFlight: boolean
  snapshotRecoveryKey: string | null
  snapshotReplayBuffer: CodexRealtimeEvent[]
  snapshotRecoveryGeneration: number
}

const compareDescending = (left: string, right: string): number =>
  right.localeCompare(left)

const sortWorkspaces = (items: CodexWorkspace[]): CodexWorkspace[] =>
  [...items].sort((left, right) => {
    if (left.is_pinned !== right.is_pinned) return left.is_pinned ? -1 : 1
    const updatedOrder = compareDescending(left.updated_at, right.updated_at)
    if (updatedOrder !== 0) return updatedOrder
    return compareDescending(left.workspace_id, right.workspace_id)
  })

const sortThreads = (items: CodexThread[]): CodexThread[] =>
  [...items].sort((left, right) => {
    if (left.is_pinned !== right.is_pinned) return left.is_pinned ? -1 : 1
    const recencyOrder = compareDescending(left.recency_at, right.recency_at)
    if (recencyOrder !== 0) return recencyOrder
    const createdOrder = compareDescending(left.created_at, right.created_at)
    if (createdOrder !== 0) return createdOrder
    return compareDescending(left.upstream_thread_id, right.upstream_thread_id)
  })

const buildThreadStartRequestKey = (
  hostId: string,
  workspaceId: string,
  execution: CodexExecutionOptions,
): string => JSON.stringify(['thread.start', hostId, workspaceId, execution])

const buildSnapshotRecoveryKey = (
  generation: number,
  hostId: string,
  threadId: string,
): string => JSON.stringify([generation, hostId, threadId])

const DEFAULT_CODEX_EXECUTION_OPTIONS: CodexExecutionOptions = {
  model: null,
  reasoning_effort: null,
  sandbox_mode: CodexSandboxMode.WorkspaceWrite,
  approval_policy: CodexApprovalPolicy.Untrusted,
}

const isCodexTurnSubmissionTimeout = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false
  const normalized = error as ApiErrorPayload
  if (normalized.statusCode === 408) return true
  if (normalized.code === 'ETIMEDOUT' || normalized.errorCode === 'ETIMEDOUT')
    return true
  return (
    normalized.cause instanceof Error &&
    (normalized.cause.name === 'TimeoutError' ||
      normalized.cause.name === 'AbortError')
  )
}

/**
 * 发送资格只由连接状态机决定，不能由页面是否可见或 socket 到达时间推断。
 *
 * 返回值可直接用于 UI 提示和 action 边界拦截，保证快捷键、失败重试和未来调用方
 * 共享同一语义；离线时绝不创建本地待发送队列。
 */
export const getCodexTurnSubmissionBlockReason = (
  status: CodexRealtimeConnectionStatus,
  host?: CodexHost | null,
): string | null =>
  getCodexRealtimeWriteBlockReason(status, 'turn_submission', host)

/** 将已由服务端授权收敛的工作区偏好转换为创建或继续会话所需的执行字段。 */
const toCodexExecutionOptions = (
  preferences: CodexWorkspaceExecutionPreferences | null | undefined,
): CodexExecutionOptions =>
  preferences
    ? {
        model: preferences.requested?.model ?? null,
        reasoning_effort: preferences.requested?.reasoning_effort ?? null,
        sandbox_mode: preferences.sandbox_mode,
        approval_policy: preferences.approval_policy,
      }
    : { ...DEFAULT_CODEX_EXECUTION_OPTIONS }

const isReplayForFullyCoveredTerminalTurn = (
  fullyCoveredTerminalTurnIds: ReadonlySet<string>,
  event: CodexRealtimeEvent,
): boolean => {
  let turnId: string | null
  switch (event.detail.kind) {
    case CodexRealtimeEventType.TurnStarted:
    case CodexRealtimeEventType.TurnCompleted:
    case CodexRealtimeEventType.TurnFailed:
    case CodexRealtimeEventType.TurnInterrupted:
      turnId = event.detail.turn.turn_id
      break
    case CodexRealtimeEventType.ItemUpsert:
      turnId = event.detail.item.header.turn_id
      break
    case CodexRealtimeEventType.TurnPlanUpdated:
    case CodexRealtimeEventType.TurnDiffUpdated:
    case CodexRealtimeEventType.ItemDelta:
      turnId = event.detail.turn_id
      break
    default:
      return false
  }
  return turnId !== null && fullyCoveredTerminalTurnIds.has(turnId)
}

export const useCodexSessionStore = defineStore('codex-session', {
  state: (): CodexSessionStoreState => ({
    projection: createCodexSessionProjection(),
    selectedHostId: null,
    selectedWorkspaceId: null,
    selectedThreadId: null,
    workspaceSelectionState: WorkspaceSelectionState.Missing,
    selectionError: null,
    loading: false,
    pendingTurnByThreadId: {},
    failedTurnByOperationId: {},
    confirmationRequiredOperationIds: [],
    pendingThreadStart: null,
    resumedThreadIds: [],
    lastError: null,
    threadSearchTerm: '',
    showArchivedThreads: false,
    threadNextCursor: null,
    threadLoadRequestId: 0,
    snapshotRecoveryInFlight: false,
    snapshotRecoveryKey: null,
    snapshotReplayBuffer: [],
    snapshotRecoveryGeneration: 0,
  }),
  getters: {
    hosts(state): CodexHost[] {
      return Object.values(state.projection.hostsById)
    },
    selectedHost(state): CodexHost | null {
      return state.selectedHostId
        ? (state.projection.hostsById[state.selectedHostId] ?? null)
        : null
    },
    workspaces(state): CodexWorkspace[] {
      const items = Object.values(state.projection.workspacesById)
      return sortWorkspaces(
        items.filter((workspace) => workspace.host_id === state.selectedHostId),
      )
    },
    selectedWorkspace(state): CodexWorkspace | null {
      return state.selectedWorkspaceId
        ? (state.projection.workspacesById[state.selectedWorkspaceId] ?? null)
        : null
    },
    /** 执行参数始终派生自当前项目，路由恢复和实时更新不维护第二份状态。 */
    executionOptions(): CodexExecutionOptions {
      return toCodexExecutionOptions(
        this.selectedWorkspace?.execution_preferences,
      )
    },
    threads(state): CodexThread[] {
      const normalizedSearchTerm = state.threadSearchTerm
        .trim()
        .toLocaleLowerCase()
      const items = Object.values(state.projection.threadsById).filter(
        (thread) => {
          if (
            thread.host_id !== state.selectedHostId ||
            thread.archived !== state.showArchivedThreads ||
            (state.selectedWorkspaceId &&
              thread.workspace_id !== state.selectedWorkspaceId)
          ) {
            return false
          }
          if (!normalizedSearchTerm) return true
          // 服务端已经按 thread title 过滤；本地兜底也只能检查同一个标题字段，
          // 避免工作区名称、分支或正文类数据扩大搜索结果。
          return thread.display_name
            .toLocaleLowerCase()
            .includes(normalizedSearchTerm)
        },
      )
      return sortThreads(items)
    },
    hostThreads(state): CodexThread[] {
      return sortThreads(
        Object.values(state.projection.threadsById).filter(
          (thread) => thread.host_id === state.selectedHostId,
        ),
      )
    },
    selectedThread(state): CodexThread | null {
      return state.selectedThreadId
        ? (state.projection.threadsById[state.selectedThreadId] ?? null)
        : null
    },
    selectedTimeline(state): CodexTimelineRenderableItem[] {
      if (!state.selectedThreadId) return []
      return (
        state.projection.timelineItemsByThread[state.selectedThreadId] ?? []
      )
    },
    selectedHistoryStatus(state): CodexThreadHistoryStatus | null {
      if (!state.selectedThreadId) return null
      return (
        state.projection.historyStatusByThread[state.selectedThreadId] ?? null
      )
    },
    selectedHistoryCursor(state): string | null {
      if (!state.selectedThreadId) return null
      return (
        state.projection.historyCursorByThread[state.selectedThreadId] ?? null
      )
    },
    selectedPendingTurn(state): CodexOperationAccepted | null {
      if (!state.selectedThreadId) return null
      return state.pendingTurnByThreadId[state.selectedThreadId] ?? null
    },
  },
  actions: {
    invalidateSnapshotRecovery(): void {
      this.snapshotRecoveryGeneration += 1
      this.snapshotRecoveryInFlight = false
      this.snapshotRecoveryKey = null
      this.snapshotReplayBuffer = []
      snapshotLoadInFlight = null
    },

    invalidateResumedThreadsForHost(hostId: string): void {
      this.resumedThreadIds = this.resumedThreadIds.filter(
        (threadId) => this.projection.threadsById[threadId]?.host_id !== hostId,
      )
    },

    async loadHosts(): Promise<void> {
      if (hostsLoadInFlight) return hostsLoadInFlight
      const generation = sessionLoadGeneration
      this.loading = true
      this.lastError = null
      const request = (async (): Promise<void> => {
        const collection = await createCodexHostsClient().list()
        if (generation !== sessionLoadGeneration) return
        for (const host of collection.items) {
          const previous = this.projection.hostsById[host.host_id]
          if (
            previous?.capabilities.app_server_instance_id !==
            host.capabilities.app_server_instance_id
          ) {
            this.invalidateResumedThreadsForHost(host.host_id)
          }
        }
        this.projection = replaceCodexHosts(this.projection, collection.items)
        this.reconcileSelections()
      })()
      hostsLoadInFlight = request
      try {
        await request
      } catch (error) {
        if (generation === sessionLoadGeneration) {
          this.lastError = error as ApiErrorPayload
        }
        throw error
      } finally {
        if (hostsLoadInFlight === request) hostsLoadInFlight = null
        this.loading = false
      }
    },

    /** Keep host mutations on the session projection so every page observes one entity source. */
    upsertHost(host: CodexHost): void {
      this.projection.hostsById[host.host_id] = host
      this.reconcileSelections()
    },

    prepareHostSelection(hostId: string): void {
      if (this.selectedHostId === hostId) return
      this.invalidateSnapshotRecovery()
      this.projection = {
        ...createCodexSessionProjection(),
        hostsById: this.projection.hostsById,
        workspacesById: this.projection.workspacesById,
      }
      this.resumedThreadIds = []
      this.pendingTurnByThreadId = {}
      this.pendingThreadStart = null
    },

    async selectHost(hostId: string): Promise<void> {
      await createCodexHostsClient().activate(hostId)
      await this.loadHosts()
      this.prepareHostSelection(hostId)
      const preservedWorkspaceId =
        this.selectedHostId === hostId ? this.selectedWorkspaceId : null
      this.selectedHostId = hostId
      this.selectedWorkspaceId = preservedWorkspaceId
      this.selectedThreadId = null
      this.selectionError = null
      this.workspaceSelectionState = WorkspaceSelectionState.Loading
      await this.loadWorkspaces()
      const workspaceId =
        preservedWorkspaceId ??
        this.workspaces.find((workspace) => workspace.enabled)?.workspace_id ??
        null
      if (workspaceId) {
        this.restoreWorkspace(workspaceId)
        await this.loadThreads(workspaceId)
      } else this.workspaceSelectionState = WorkspaceSelectionState.Missing
    },

    async loadWorkspaces(): Promise<void> {
      if (!this.selectedHostId) return
      const hostId = this.selectedHostId
      if (workspacesLoadInFlight?.key === hostId) {
        return workspacesLoadInFlight.promise
      }
      const generation = sessionLoadGeneration
      const request = (async (): Promise<void> => {
        const collection = await createCodexWorkspacesClient().list(hostId)
        if (
          generation !== sessionLoadGeneration ||
          hostId !== this.selectedHostId
        ) {
          return
        }
        this.projection = replaceCodexWorkspacesForHost(
          this.projection,
          hostId,
          collection.items,
        )
        this.reconcileSelections()
      })()
      workspacesLoadInFlight = { key: hostId, promise: request }
      try {
        await request
      } finally {
        if (workspacesLoadInFlight?.promise === request) {
          workspacesLoadInFlight = null
        }
      }
    },

    async updateWorkspaceIsolation(
      workspace: CodexWorkspace,
      enabled: boolean,
    ): Promise<void> {
      const updated = await createCodexWorkspacesClient().update(
        workspace.host_id,
        workspace.workspace_id,
        {
          worktree_policy: {
            ...workspace.worktree_policy,
            enabled,
          },
        },
      )
      this.projection.workspacesById[updated.workspace_id] = updated
    },

    async updateWorkspacePin(
      workspace: CodexWorkspace,
      isPinned: boolean,
    ): Promise<void> {
      const updated = await createCodexWorkspacesClient().update(
        workspace.host_id,
        workspace.workspace_id,
        { is_pinned: isPinned },
      )
      this.projection.workspacesById[updated.workspace_id] = updated
    },

    async loadWorkspaceExecutionPreferences(): Promise<CodexWorkspaceExecutionPreferencesResult | null> {
      const hostId = this.selectedHostId
      const workspaceId = this.selectedWorkspaceId
      if (!hostId || !workspaceId) return null
      const result =
        await createCodexWorkspacesClient().readExecutionPreferences(
          hostId,
          workspaceId,
        )
      if (
        hostId !== this.selectedHostId ||
        workspaceId !== this.selectedWorkspaceId
      ) {
        return null
      }
      this.applyExecutionPreferencesResult(result)
      return result
    },

    async updateWorkspaceExecutionPreferences(
      request: CodexWorkspaceExecutionPreferencesUpdate,
      context: { hostId: string; workspaceId: string },
    ): Promise<CodexWorkspaceExecutionPreferencesResult> {
      const { hostId, workspaceId } = context
      if (!hostId || !workspaceId) {
        throw new Error('更新执行偏好前必须选择主机和项目。')
      }
      const result =
        await createCodexWorkspacesClient().updateExecutionPreferences(
          hostId,
          workspaceId,
          request,
        )
      if (
        hostId === this.selectedHostId &&
        workspaceId === this.selectedWorkspaceId
      ) {
        this.applyExecutionPreferencesResult(result)
      }
      return result
    },

    applyExecutionPreferencesResult(
      result: CodexWorkspaceExecutionPreferencesResult,
    ): void {
      const workspace = this.projection.workspacesById[result.workspace_id]
      if (workspace) {
        this.projection.workspacesById[result.workspace_id] = {
          ...workspace,
          execution_preferences: result.effective_preferences,
        }
      }
      this.clearPendingThreadStart()
    },

    async loadThreads(workspaceId?: string | null): Promise<void> {
      const targetWorkspaceId =
        workspaceId === undefined ? this.selectedWorkspaceId : workspaceId
      if (!this.selectedHostId) return
      const hostId = this.selectedHostId
      const requestKey = JSON.stringify([
        hostId,
        targetWorkspaceId,
        this.showArchivedThreads,
        this.threadSearchTerm,
      ])
      if (threadsLoadInFlight?.key === requestKey) {
        return threadsLoadInFlight.promise
      }
      const requestId = this.threadLoadRequestId + 1
      this.threadLoadRequestId = requestId
      const generation = sessionLoadGeneration
      const archived = this.showArchivedThreads
      const searchTerm = this.threadSearchTerm
      const request = (async (): Promise<void> => {
        const collection = await createCodexThreadsClient().list(hostId, {
          workspace_id: targetWorkspaceId,
          archived,
          search_term: searchTerm || null,
        })
        if (
          generation !== sessionLoadGeneration ||
          requestId !== this.threadLoadRequestId ||
          hostId !== this.selectedHostId
        ) {
          return
        }
        this.projection = replaceCodexThreadsForQuery(
          this.projection,
          {
            hostId,
            workspaceId: targetWorkspaceId ?? null,
            archived,
            searchTerm,
          },
          collection.items,
        )
        this.threadNextCursor = collection.next_cursor
        this.reconcileSelections()
      })()
      threadsLoadInFlight = { key: requestKey, promise: request }
      try {
        await request
      } finally {
        if (threadsLoadInFlight?.promise === request) threadsLoadInFlight = null
      }
    },

    async setThreadSearchTerm(
      searchTerm: string,
      workspaceId?: string | null,
    ): Promise<void> {
      await this.applyRouteFilters({
        searchTerm,
        showArchived: this.showArchivedThreads,
        workspaceId,
      })
    },

    async loadMoreThreads(): Promise<void> {
      const hostId = this.selectedHostId
      const cursor = this.threadNextCursor
      if (!hostId || !cursor || threadsLoadInFlight) return
      const generation = sessionLoadGeneration
      const requestId = this.threadLoadRequestId
      const workspaceId = this.selectedWorkspaceId
      const archived = this.showArchivedThreads
      const searchTerm = this.threadSearchTerm
      const request = (async () => {
        const collection = await createCodexThreadsClient().list(hostId, {
          workspace_id: workspaceId,
          archived,
          search_term: searchTerm || null,
          cursor,
        })
        if (
          generation !== sessionLoadGeneration ||
          requestId !== this.threadLoadRequestId ||
          hostId !== this.selectedHostId ||
          workspaceId !== this.selectedWorkspaceId ||
          archived !== this.showArchivedThreads ||
          searchTerm !== this.threadSearchTerm
        )
          return
        this.projection = {
          ...this.projection,
          threadsById: {
            ...this.projection.threadsById,
            ...Object.fromEntries(
              collection.items.map((thread) => [
                thread.upstream_thread_id,
                thread,
              ]),
            ),
          },
        }
        this.threadNextCursor = collection.next_cursor
      })()
      threadsLoadInFlight = { key: cursor, promise: request }
      try {
        await request
      } finally {
        if (threadsLoadInFlight?.promise === request) threadsLoadInFlight = null
      }
    },

    async setArchivedThreadsVisible(visible: boolean): Promise<void> {
      await this.applyRouteFilters({
        searchTerm: this.threadSearchTerm,
        showArchived: visible,
        workspaceId: this.selectedWorkspaceId,
      })
    },

    async applyRouteFilters(input: {
      searchTerm: string
      showArchived: boolean
      workspaceId?: string | null
      reload?: boolean
    }): Promise<void> {
      const searchTerm = input.searchTerm.trim()
      const showArchived = Boolean(input.showArchived)
      const changed =
        searchTerm !== this.threadSearchTerm ||
        showArchived !== this.showArchivedThreads
      if (!changed) return
      this.invalidateSnapshotRecovery()
      this.threadSearchTerm = searchTerm
      this.showArchivedThreads = showArchived
      this.threadNextCursor = null
      this.selectedThreadId = null
      if ((input.reload ?? true) && this.selectedHostId) {
        await this.loadThreads(
          input.workspaceId === undefined
            ? this.selectedWorkspaceId
            : input.workspaceId,
        )
      }
    },

    async renameThread(
      thread: CodexThread,
      displayName: string,
    ): Promise<void> {
      const normalizedTitle = displayName.trim()
      if (!normalizedTitle) throw new Error('会话标题不能为空。')
      try {
        const accepted = await createCodexThreadsClient().rename(
          thread.host_id,
          thread.upstream_thread_id,
          { display_name: normalizedTitle },
        )
        await waitForCodexOperation(thread.host_id, accepted)
      } finally {
        await this.loadThreads()
      }
    },

    async updateThreadPin(
      thread: CodexThread,
      isPinned: boolean,
    ): Promise<void> {
      const updated = await createCodexThreadsClient().updatePin(
        thread.host_id,
        thread.upstream_thread_id,
        { is_pinned: isPinned },
      )
      this.projection.threadsById[updated.upstream_thread_id] = updated
    },

    async archiveThread(thread: CodexThread): Promise<void> {
      const accepted = await createCodexThreadsClient().archive(
        thread.host_id,
        thread.upstream_thread_id,
      )
      await waitForCodexOperation(thread.host_id, accepted)
      await this.loadThreads()
    },

    async unarchiveThread(thread: CodexThread): Promise<void> {
      const accepted = await createCodexThreadsClient().unarchive(
        thread.host_id,
        thread.upstream_thread_id,
      )
      await waitForCodexOperation(thread.host_id, accepted)
      await this.loadThreads()
    },

    async waitForCreatedThread(): Promise<CodexThread | null> {
      const hostId = this.selectedHostId
      const accepted = this.pendingThreadStart?.operation
      if (!hostId || !accepted) throw new Error('缺少创建操作身份。')
      const operation = await waitForCodexOperation(hostId, accepted)
      if (!operation.thread_id)
        throw new Error('创建结果缺少会话身份，请重新核对操作。')
      const snapshot = await createCodexThreadsClient().read(
        hostId,
        operation.thread_id,
      )
      this.projection.threadsById[operation.thread_id] = snapshot.thread
      if (hostId === this.selectedHostId) this.selectThread(operation.thread_id)
      return snapshot.thread
    },

    selectWorkspace(workspaceId: string): void {
      this.restoreWorkspace(workspaceId)
    },

    restoreWorkspace(workspaceId: string): boolean {
      const workspace = this.projection.workspacesById[workspaceId]
      const selectionWillChange =
        this.selectedWorkspaceId !== workspaceId ||
        this.selectedThread?.workspace_id !== workspaceId
      if (selectionWillChange) this.invalidateSnapshotRecovery()
      if (!workspace || workspace.host_id !== this.selectedHostId) {
        this.selectedWorkspaceId = null
        this.selectedThreadId = null
        this.workspaceSelectionState = WorkspaceSelectionState.Missing
        this.selectionError = '请求的项目不存在或当前账号不可见。'
        return false
      }
      if (!workspace.enabled) {
        this.selectedWorkspaceId = null
        this.selectedThreadId = null
        this.workspaceSelectionState = WorkspaceSelectionState.Revoked
        this.selectionError = '请求的项目已停用或撤销。'
        return false
      }
      this.selectedWorkspaceId = workspaceId
      this.workspaceSelectionState = WorkspaceSelectionState.Resolved
      this.selectionError = null
      const selectedThread = this.selectedThread
      if (selectedThread?.workspace_id !== workspaceId) {
        this.selectedThreadId = null
      }
      return true
    },

    selectThread(threadId: string): void {
      if (this.selectedThreadId !== threadId) this.invalidateSnapshotRecovery()
      this.selectedThreadId = threadId
      const thread = this.projection.threadsById[threadId]
      if (thread) {
        this.selectedHostId = thread.host_id
        this.selectedWorkspaceId = thread.workspace_id
      }
    },

    restoreThread(threadId: string, expectedWorkspaceId?: string): boolean {
      if (this.selectedThreadId !== threadId) this.invalidateSnapshotRecovery()
      const thread = this.projection.threadsById[threadId]
      if (!thread) {
        this.selectedThreadId = null
        this.selectionError = '请求的会话不存在或当前账号不可见。'
        return false
      }
      if (expectedWorkspaceId && thread.workspace_id !== expectedWorkspaceId) {
        this.selectedThreadId = null
        this.selectedWorkspaceId = null
        this.workspaceSelectionState = WorkspaceSelectionState.Missing
        this.selectionError = '会话与路由中的项目不匹配。'
        return false
      }
      this.selectedHostId = thread.host_id
      if (!this.restoreWorkspace(thread.workspace_id)) return false
      this.selectedThreadId = threadId
      return true
    },

    async restoreRouteSelection(route: CodexTaskRoute): Promise<boolean> {
      this.invalidateSnapshotRecovery()
      this.selectionError = null
      this.workspaceSelectionState = WorkspaceSelectionState.Loading
      await this.loadHosts()
      let hostId = route.hostId
      if (hostId && !this.projection.hostsById[hostId]) {
        this.selectedHostId = null
        this.selectedWorkspaceId = null
        this.selectedThreadId = null
        this.workspaceSelectionState = WorkspaceSelectionState.Missing
        this.selectionError = '请求的主机不存在或当前账号不可见。'
        return false
      }
      if (!hostId && (route.threadId || route.workspaceId)) {
        this.workspaceSelectionState = WorkspaceSelectionState.Missing
        this.selectionError = '会话链接缺少可验证的主机定位信息。'
        return false
      }
      hostId ??= this.selectedHostId ?? this.hosts[0]?.host_id
      if (!hostId) {
        this.workspaceSelectionState = WorkspaceSelectionState.Missing
        this.selectionError = '当前没有可用主机。'
        return false
      }
      this.prepareHostSelection(hostId)
      this.selectedHostId = hostId
      this.selectedWorkspaceId = null
      await this.loadWorkspaces()
      let routeThread: CodexThread | undefined
      if (route.threadId) {
        routeThread = this.projection.threadsById[route.threadId]
        if (!routeThread) {
          // A deep link can point beyond the first list page. Resolve its identity directly.
          const snapshot = await createCodexThreadsClient().read(
            hostId,
            route.threadId,
            undefined,
            false,
          )
          routeThread = snapshot.thread
        }
        this.projection.threadsById[route.threadId] = routeThread
        if (!this.restoreThread(route.threadId, route.workspaceId)) return false
      }
      const workspaceId =
        routeThread?.workspace_id ??
        route.workspaceId ??
        this.selectedWorkspaceId ??
        this.workspaces.find((workspace) => workspace.enabled)?.workspace_id
      if (!workspaceId) {
        this.selectedWorkspaceId = null
        this.workspaceSelectionState = WorkspaceSelectionState.Missing
        this.selectionError = '当前主机没有可用项目。'
        return false
      }
      if (!this.restoreWorkspace(workspaceId)) return false
      await this.loadThreads(workspaceId)
      if (routeThread) {
        this.projection.threadsById[routeThread.upstream_thread_id] =
          routeThread
        return this.restoreThread(routeThread.upstream_thread_id, workspaceId)
      }
      return true
    },

    async createThread(): Promise<CodexOperationAccepted> {
      if (!this.selectedHostId || !this.selectedWorkspaceId) {
        throw new Error('创建Codex线程前必须选择主机和工作区。')
      }
      const requestKey = buildThreadStartRequestKey(
        this.selectedHostId,
        this.selectedWorkspaceId,
        this.executionOptions,
      )
      if (this.pendingThreadStart?.requestKey !== requestKey) {
        this.pendingThreadStart = {
          requestKey,
          idempotencyKey: createCodexIdempotencyKey(),
          operation: null,
        }
      }
      const pendingThreadStart = this.pendingThreadStart
      const accepted = await createCodexThreadsClient().create(
        this.selectedHostId,
        {
          workspace_id: this.selectedWorkspaceId,
          execution: this.executionOptions,
        },
        pendingThreadStart.idempotencyKey,
      )
      this.pendingThreadStart = {
        ...pendingThreadStart,
        operation: accepted,
      }
      await this.loadThreads()
      return accepted
    },

    clearPendingThreadStart(): void {
      if (!this.selectedHostId || !this.selectedWorkspaceId) {
        this.pendingThreadStart = null
        return
      }
      const requestKey = buildThreadStartRequestKey(
        this.selectedHostId,
        this.selectedWorkspaceId,
        this.executionOptions,
      )
      if (this.pendingThreadStart?.requestKey === requestKey) {
        this.pendingThreadStart = null
      }
    },

    async loadThreadSnapshot(
      includeHistory = true,
      signal?: AbortSignal,
    ): Promise<void> {
      if (!this.selectedHostId || !this.selectedThreadId) return
      const hostId = this.selectedHostId
      const threadId = this.selectedThreadId
      const generation = sessionLoadGeneration
      const requestKey = buildSnapshotRecoveryKey(generation, hostId, threadId)
      const flightKey = `${requestKey}:${includeHistory}`
      if (snapshotLoadInFlight?.key === flightKey) {
        return snapshotLoadInFlight.promise
      }
      if (snapshotLoadInFlight) {
        await snapshotLoadInFlight.promise.catch(() => undefined)
        if (signal?.aborted || generation !== sessionLoadGeneration) return
      }
      const recoveryGeneration = this.snapshotRecoveryGeneration + 1
      this.snapshotRecoveryGeneration = recoveryGeneration
      this.snapshotRecoveryKey = requestKey
      this.snapshotReplayBuffer = []
      // The realtime controller may synchronously flush its pending frame into
      // this buffer when recovery starts. Initialize the buffer first.
      this.snapshotRecoveryInFlight = true
      const isCurrentRecovery = (): boolean =>
        generation === sessionLoadGeneration &&
        recoveryGeneration === this.snapshotRecoveryGeneration &&
        this.snapshotRecoveryKey === requestKey &&
        this.selectedHostId === hostId &&
        this.selectedThreadId === threadId
      const request = (async (): Promise<void> => {
        try {
          const snapshot = await createCodexThreadsClient().read(
            hostId,
            threadId,
            undefined,
            includeHistory,
            signal,
          )
          if (signal?.aborted)
            throw new DOMException('Recovery cancelled', 'AbortError')
          if (!isCurrentRecovery()) return
          if (
            !includeHistory &&
            snapshot.history_status === 'not_available_yet'
          ) {
            throw new Error('当前任务实时状态暂不可用。')
          }
          const snapshotEvent = validateCodexRealtimeEvent({
            header: {
              kind: 'codex_realtime_event',
              schema_version: CODEX_REALTIME_SCHEMA_VERSION,
              stream_epoch: CODEX_REALTIME_STREAM_EPOCH,
              cursor: null,
              event_id: `snapshot-${threadId}-${Date.now()}`,
              occurred_at: new Date().toISOString(),
              host_id: hostId,
              workspace_id: snapshot.thread.workspace_id,
              thread_id: threadId,
              turn_id: null,
              item_id: null,
              detail_kind: CodexRealtimeEventType.ThreadSnapshot,
            },
            detail: {
              kind: CodexRealtimeEventType.ThreadSnapshot,
              schema_version: CODEX_REALTIME_SCHEMA_VERSION,
              ...snapshot,
            },
          })
          this.snapshotRecoveryInFlight = false
          const replay = this.snapshotReplayBuffer
          this.snapshotReplayBuffer = []
          this.applyRealtimeEvent(snapshotEvent, {
            bypassSnapshotRecovery: true,
          })
          const fullyCoveredTerminalTurnIds =
            getFullyCoveredTerminalTurnIds(snapshot)
          this.applyRealtimeBatch(
            replay.filter(
              (event) =>
                !(
                  event.header.source_epoch === snapshot.source_epoch &&
                  event.header.source_seq != null &&
                  event.header.source_seq <= (snapshot.source_seq ?? -1) &&
                  isReplayForFullyCoveredTerminalTurn(
                    fullyCoveredTerminalTurnIds,
                    event,
                  )
                ),
            ),
            { bypassSnapshotRecovery: true },
          )
        } catch (error) {
          if (isCurrentRecovery()) {
            this.snapshotRecoveryInFlight = false
            const replay = this.snapshotReplayBuffer
            this.snapshotReplayBuffer = []
            this.applyRealtimeBatch(replay, { bypassSnapshotRecovery: true })
          }
          throw error
        } finally {
          if (isCurrentRecovery()) {
            this.snapshotRecoveryInFlight = false
            this.snapshotRecoveryKey = null
            this.snapshotReplayBuffer = []
          }
        }
      })()
      snapshotLoadInFlight = { key: flightKey, promise: request }
      try {
        await request
      } finally {
        if (snapshotLoadInFlight?.promise === request) {
          snapshotLoadInFlight = null
        }
      }
    },

    async loadMoreHistory(): Promise<void> {
      const beforeCursor = this.selectedHistoryCursor
      const hostId = this.selectedHostId
      const threadId = this.selectedThreadId
      if (!beforeCursor || !hostId || !threadId) return
      const requestGeneration = sessionLoadGeneration
      const requestKey = [
        requestGeneration,
        hostId,
        threadId,
        beforeCursor,
      ].join(':')
      if (historyLoadInFlight?.key === requestKey)
        return historyLoadInFlight.promise

      const request = (async (): Promise<void> => {
        const page = await createCodexThreadsClient().readHistory(
          hostId,
          threadId,
          beforeCursor,
        )
        // 选择或 session 在请求期间变化时，旧页不能覆盖新窗口的 cursor。
        if (
          requestGeneration !== sessionLoadGeneration ||
          this.selectedHostId !== hostId ||
          this.selectedThreadId !== threadId ||
          this.selectedHistoryCursor !== beforeCursor
        ) {
          return
        }
        this.projection = prependCodexHistoryPage(
          this.projection,
          threadId,
          page,
        )
      })()
      historyLoadInFlight = { key: requestKey, promise: request }
      try {
        await request
      } finally {
        if (historyLoadInFlight?.promise === request) historyLoadInFlight = null
      }
    },

    evictTimelineBodies(protectedItemIds: readonly string[]): void {
      if (!this.selectedThreadId) return
      this.projection = evictCodexTimelineBodies(
        this.projection,
        this.selectedThreadId,
        new Set(protectedItemIds),
      )
    },

    async reloadTimelineBody(itemId: string): Promise<void> {
      if (!this.selectedHostId || !this.selectedThreadId) return
      const reloaded = await createCodexThreadsClient().readHistoryItems(
        this.selectedHostId,
        this.selectedThreadId,
        [itemId],
      )
      this.projection = restoreCodexTimelineBodies(
        this.projection,
        reloaded.items,
      )
    },

    async ensureThreadReady(): Promise<void> {
      if (!this.selectedHostId || !this.selectedThreadId) {
        throw new Error('继续Codex线程前必须选择线程。')
      }
      if (this.resumedThreadIds.includes(this.selectedThreadId)) return
      const hostId = this.selectedHostId
      const threadId = this.selectedThreadId
      const thread = this.selectedThread
      // A just-created thread has no upstream rollout until its first turn.
      // Starting that turn is the materialization step; resume applies only to
      // threads whose official history already exists.
      if (
        thread?.source_kind === 'remote' &&
        !thread.turn_runtime &&
        this.selectedHistoryStatus === CodexThreadHistoryStatus.NotMaterialized
      ) {
        return
      }
      const accepted = await createCodexThreadsClient().resume(
        hostId,
        threadId,
        this.executionOptions,
      )
      await waitForCodexOperation(hostId, accepted)
      this.resumedThreadIds.push(threadId)
      await this.loadThreadSnapshot()
    },

    async sendMessage(message: string): Promise<CodexOperationAccepted> {
      const submissionBlockReason = getCodexTurnSubmissionBlockReason(
        useCodexRealtimeStore().status,
        this.selectedHost,
      )
      if (submissionBlockReason) throw new Error(submissionBlockReason)
      const normalizedMessage = message.trim()
      if (
        !this.selectedHostId ||
        !this.selectedThreadId ||
        !normalizedMessage
      ) {
        throw new Error('发送消息前必须选择线程并输入内容。')
      }
      const hostId = this.selectedHostId
      const threadId = this.selectedThreadId
      const thread = this.selectedThread
      if (thread?.archived) {
        throw new Error('已归档会话不能发送新消息。')
      }
      const submission: FailedCodexTurnSubmission = {
        clientOperationId: createCodexIdempotencyKey(),
        hostId,
        threadId,
        message: normalizedMessage,
        execution: { ...this.executionOptions },
        activeTurn: Boolean(thread?.active_turn_id),
      }
      this.appendOptimisticUserMessage(
        submission.message,
        submission.clientOperationId,
      )
      return this.submitTurnMessage(submission, thread?.workspace_id ?? null)
    },

    /** 用户明确触发失败消息的重试，复用原 client operation id。 */
    async retryMessage(
      clientOperationId: string,
    ): Promise<CodexOperationAccepted> {
      const submissionBlockReason = getCodexTurnSubmissionBlockReason(
        useCodexRealtimeStore().status,
        this.selectedHost,
      )
      if (submissionBlockReason) throw new Error(submissionBlockReason)
      const submission = this.failedTurnByOperationId[clientOperationId]
      if (!submission) throw new Error('待重试的消息已不存在。')
      this.confirmationRequiredOperationIds =
        this.confirmationRequiredOperationIds.filter(
          (operationId) => operationId !== clientOperationId,
        )
      this.markOptimisticUserMessageSending(clientOperationId)
      return this.submitTurnMessage(submission, this.selectedWorkspaceId)
    },

    async submitTurnMessage(
      submission: FailedCodexTurnSubmission,
      workspaceId: string | null,
    ): Promise<CodexOperationAccepted> {
      let accepted: CodexOperationAccepted
      try {
        if (!submission.activeTurn) await this.ensureThreadReady()
        const request = {
          client_operation_id: submission.clientOperationId,
          message: submission.message,
          execution: submission.execution,
        }
        const client = createCodexThreadsClient()
        accepted = submission.activeTurn
          ? await client.steer(submission.hostId, submission.threadId, request)
          : await client.startTurn(
              submission.hostId,
              submission.threadId,
              request,
            )
        this.pendingTurnByThreadId[submission.threadId] = accepted
        Reflect.deleteProperty(
          this.failedTurnByOperationId,
          submission.clientOperationId,
        )
        this.confirmationRequiredOperationIds =
          this.confirmationRequiredOperationIds.filter(
            (operationId) => operationId !== submission.clientOperationId,
          )
      } catch (error) {
        this.failedTurnByOperationId[submission.clientOperationId] = submission
        if (isCodexTurnSubmissionTimeout(error)) {
          if (
            !this.confirmationRequiredOperationIds.includes(
              submission.clientOperationId,
            )
          ) {
            this.confirmationRequiredOperationIds.push(
              submission.clientOperationId,
            )
          }
        } else {
          this.confirmationRequiredOperationIds =
            this.confirmationRequiredOperationIds.filter(
              (operationId) => operationId !== submission.clientOperationId,
            )
        }
        this.markOptimisticUserMessageFailed(submission.clientOperationId)
        throw error
      }

      // The command is already accepted at this point. A best-effort index
      // refresh must not turn an accepted send into a failed optimistic item
      // or invite the user to submit the same operation again.
      try {
        await this.loadThreads(workspaceId)
      } catch (error) {
        this.lastError = error as ApiErrorPayload
      }
      return accepted
    },

    async interruptTurn(): Promise<CodexOperationAccepted> {
      const blockReason = getCodexRealtimeWriteBlockReason(
        useCodexRealtimeStore().status,
        'interrupt',
        this.selectedHost,
      )
      if (blockReason) throw new Error(blockReason)
      if (!this.selectedHostId || !this.selectedThreadId) {
        throw new Error('中断操作前必须选择线程。')
      }
      const accepted = await createCodexThreadsClient().interrupt(
        this.selectedHostId,
        this.selectedThreadId,
      )
      return accepted
    },

    async compactThread(): Promise<CodexOperationAccepted> {
      const blockReason = getCodexRealtimeWriteBlockReason(
        useCodexRealtimeStore().status,
        'compact',
        this.selectedHost,
      )
      if (blockReason) throw new Error(blockReason)
      if (!this.selectedHostId || !this.selectedThreadId) {
        throw new Error('压缩操作前必须选择线程。')
      }
      const accepted = await createCodexThreadsClient().compact(
        this.selectedHostId,
        this.selectedThreadId,
      )
      return accepted
    },

    /**
     * 将当前选择恢复为服务端权威视图；同一选择的并发请求必须复用一次只读同步，
     * 防止 stalled 提示和连接恢复同时读取时交错覆盖快照或扩大 Agent 读取负载。
     */
    async refreshAuthority(signal?: AbortSignal): Promise<void> {
      const generation = sessionLoadGeneration
      const hostId = this.selectedHostId
      const workspaceId = this.selectedWorkspaceId
      const threadId = this.selectedThreadId
      const requestKey = [
        generation,
        hostId ?? '',
        workspaceId ?? '',
        threadId ?? '',
      ].join(':')
      if (
        authorityRefreshInFlight?.key === requestKey &&
        !authorityRefreshInFlight.signal?.aborted
      )
        return authorityRefreshInFlight.promise

      const isCurrentSelection = (): boolean =>
        !signal?.aborted &&
        generation === sessionLoadGeneration &&
        this.selectedHostId === hostId &&
        this.selectedWorkspaceId === workspaceId &&
        this.selectedThreadId === threadId

      const request = (async (): Promise<void> => {
        await this.loadHosts()
        if (!isCurrentSelection()) return
        if (hostId) {
          await Promise.all([this.loadWorkspaces(), this.loadThreads()])
          if (!isCurrentSelection()) return
        }
        if (!threadId) return
        await this.loadThreadSnapshot(false, signal)
      })()
      authorityRefreshInFlight = { key: requestKey, promise: request, signal }
      try {
        await request
      } finally {
        if (authorityRefreshInFlight?.promise === request)
          authorityRefreshInFlight = null
      }
    },

    applyRealtimeEvent(
      event: CodexRealtimeEvent,
      options: { bypassSnapshotRecovery?: boolean } = {},
    ): void {
      this.applyRealtimeBatch([event], options)
    },

    /**
     * 同一个网络批次只提交一次投影，避免流式 delta 逐条触发 Vue 刷新。
     */
    applyRealtimeBatch(
      events: readonly CodexRealtimeEvent[],
      options: { bypassSnapshotRecovery?: boolean } = {},
    ): void {
      events = events.filter(
        (event) =>
          !event.header.thread_id ||
          event.header.host_id === this.selectedHostId,
      )
      const snapshotRecoveryKey =
        this.selectedHostId && this.selectedThreadId
          ? buildSnapshotRecoveryKey(
              sessionLoadGeneration,
              this.selectedHostId,
              this.selectedThreadId,
            )
          : null
      if (
        this.snapshotRecoveryInFlight &&
        this.snapshotRecoveryKey === snapshotRecoveryKey &&
        !options.bypassSnapshotRecovery
      ) {
        this.snapshotReplayBuffer.push(...events)
        return
      }
      let selectionsNeedReconciliation = false
      const resolvedThreadIds = new Set<string>()
      for (const event of events) {
        if (event.detail.kind === CodexRealtimeEventType.HostSnapshot) {
          selectionsNeedReconciliation = true
        }
        if (
          event.detail.kind === CodexRealtimeEventType.HostStatusChanged &&
          event.detail.status !== CodexHostStatus.Online
        ) {
          this.invalidateResumedThreadsForHost(event.detail.host_id)
        }
        if (
          event.header.thread_id &&
          (event.detail.kind === CodexRealtimeEventType.TurnStarted ||
            event.detail.kind === CodexRealtimeEventType.TurnCompleted ||
            event.detail.kind === CodexRealtimeEventType.TurnFailed ||
            event.detail.kind === CodexRealtimeEventType.TurnInterrupted)
        ) {
          resolvedThreadIds.add(event.header.thread_id)
        }
      }
      this.projection = reduceCodexRealtimeBatch(this.projection, events)
      for (const threadId of resolvedThreadIds) {
        Reflect.deleteProperty(this.pendingTurnByThreadId, threadId)
      }
      if (selectionsNeedReconciliation) this.reconcileSelections()
    },

    removeHost(hostId: string): void {
      const hosts = this.hosts.filter((host) => host.host_id !== hostId)
      this.projection = replaceCodexHosts(this.projection, hosts)
      this.reconcileSelections()
    },

    reconcileSelections(): void {
      if (
        this.selectedHostId &&
        !this.projection.hostsById[this.selectedHostId]
      ) {
        this.selectedHostId = null
        this.selectedWorkspaceId = null
        this.selectedThreadId = null
        this.pendingTurnByThreadId = {}
        this.pendingThreadStart = null
        this.workspaceSelectionState = WorkspaceSelectionState.Revoked
        this.selectionError = '原主机已撤销或当前账号不可见。'
        return
      }
      if (!this.selectedHostId) {
        this.selectedHostId = this.hosts[0]?.host_id ?? null
      }
      if (!this.selectedHostId) {
        this.selectedWorkspaceId = null
        this.selectedThreadId = null
        return
      }
      const workspace = this.selectedWorkspaceId
        ? this.projection.workspacesById[this.selectedWorkspaceId]
        : null
      if (!workspace || workspace.host_id !== this.selectedHostId) {
        if (this.selectedWorkspaceId) {
          this.workspaceSelectionState = WorkspaceSelectionState.Revoked
          this.selectionError = '原项目已撤销或当前账号不可见。'
        }
        this.selectedWorkspaceId = null
        this.selectedThreadId = null
      }
      const thread = this.selectedThreadId
        ? this.projection.threadsById[this.selectedThreadId]
        : null
      if (!thread || thread.host_id !== this.selectedHostId) {
        this.selectedThreadId = null
      }
    },

    appendOptimisticUserMessage(
      message: string,
      clientOperationId: string,
    ): void {
      if (!this.selectedThreadId) return
      const itemId = `local-${clientOperationId}`
      const item: CodexTextTimelineItem = {
        header: {
          item_id: itemId,
          thread_id: this.selectedThreadId,
          turn_id: this.selectedThread?.active_turn_id ?? null,
          detail_kind: CodexTimelineItemKind.UserMessage,
          schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
          status: CodexTimelineItemStatus.Streaming,
          created_at: new Date().toISOString(),
          client_operation_id: clientOperationId,
        },
        detail: {
          kind: CodexTimelineItemKind.UserMessage,
          schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
          text: message,
        },
      }
      this.projection = upsertCodexTimelineItem(
        this.projection,
        item,
        CodexTimelineItemSource.Optimistic,
      )
    },

    markOptimisticUserMessageSending(clientOperationId: string): void {
      this.updateOptimisticUserMessageStatus(
        clientOperationId,
        CodexTimelineItemStatus.Streaming,
      )
    },

    markOptimisticUserMessageFailed(clientOperationId: string): void {
      this.updateOptimisticUserMessageStatus(
        clientOperationId,
        CodexTimelineItemStatus.Failed,
      )
    },

    updateOptimisticUserMessageStatus(
      clientOperationId: string,
      status: CodexTimelineItemStatus,
    ): void {
      const itemId = `local-${clientOperationId}`
      const entry = Object.entries(this.projection.itemsById).find(
        ([, value]) =>
          value.header.client_operation_id === clientOperationId &&
          value.header.item_id === itemId,
      )
      const item = entry?.[1]
      if (
        !item ||
        item.detail.kind !== CodexTimelineItemKind.UserMessage ||
        this.projection.itemSourceById[entry?.[0] ?? ''] !==
          CodexTimelineItemSource.Optimistic
      ) {
        return
      }
      // 上方判别式已验证为 user message；显式收窄可保留 header/detail 的联合关联。
      const userMessage = item as CodexTextTimelineItem
      this.projection = replaceCodexTimelineItem(this.projection, {
        ...userMessage,
        header: {
          ...userMessage.header,
          detail_kind: CodexTimelineItemKind.UserMessage,
          status,
        },
      })
    },

    clearSession(): void {
      sessionLoadGeneration += 1
      hostsLoadInFlight = null
      workspacesLoadInFlight = null
      threadsLoadInFlight = null
      authorityRefreshInFlight = null
      historyLoadInFlight = null
      snapshotLoadInFlight = null
      this.projection = createCodexSessionProjection()
      this.selectedHostId = null
      this.selectedWorkspaceId = null
      this.selectedThreadId = null
      this.pendingTurnByThreadId = {}
      this.failedTurnByOperationId = {}
      this.confirmationRequiredOperationIds = []
      this.pendingThreadStart = null
      this.resumedThreadIds = []
      this.lastError = null
      this.threadSearchTerm = ''
      this.showArchivedThreads = false
      this.threadNextCursor = null
      this.threadLoadRequestId = 0
      this.snapshotRecoveryInFlight = false
      this.snapshotRecoveryKey = null
      this.snapshotReplayBuffer = []
      this.snapshotRecoveryGeneration += 1
    },
  },
})
