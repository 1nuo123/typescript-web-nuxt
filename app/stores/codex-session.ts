import { defineStore } from 'pinia'
import type { ApiErrorPayload } from '~/types/api'
import { AuthScope } from '~/types/auth'
import {
  CODEX_APPROVAL_RESTRICTION_ORDER,
  CODEX_SANDBOX_RESTRICTION_ORDER,
  CodexApprovalPolicy,
  CodexSandboxMode,
  type CodexHost,
} from '~/types/codex-host'
import {
  CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
  CodexTimelineItemKind,
  CodexTimelineItemSource,
  CodexTimelineItemStatus,
  type CodexTextTimelineItem,
  type CodexTimelineItem,
} from '~/types/codex-item'
import {
  CODEX_REALTIME_SCHEMA_VERSION,
  CODEX_REALTIME_STREAM_EPOCH,
  CodexRealtimeEventType,
  type CodexRealtimeEvent,
} from '~/types/codex-realtime'
import type {
  CodexExecutionOptions,
  CodexThread,
  CodexThreadHistoryStatus,
} from '~/types/codex-thread'
import type { CodexOperationAccepted } from '~/types/codex-turn'
import {
  WorkspaceSelectionState,
  type CodexWorkspace,
} from '~/types/codex-workspace'
import type { CodexTaskRoute } from '~/types/routes'
import { createCodexIdempotencyKey } from '~/services/api/codex-api-client'
import {
  createCodexSessionProjection,
  reduceCodexRealtimeEvent,
  replaceCodexHosts,
  replaceCodexThreadsForQuery,
  replaceCodexWorkspacesForHost,
  type CodexSessionProjection,
} from '~/utils/codex-event-reducer'
import { validateCodexRealtimeEvent } from '~/utils/codex-event-validator'

interface PendingCodexThreadStart {
  requestKey: string
  idempotencyKey: string
  operation: CodexOperationAccepted | null
}

interface CodexInFlightLoad {
  key: string
  promise: Promise<void>
}

let hostsLoadInFlight: Promise<void> | null = null
let workspacesLoadInFlight: CodexInFlightLoad | null = null
let threadsLoadInFlight: CodexInFlightLoad | null = null
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
  pendingThreadStart: PendingCodexThreadStart | null
  resumedThreadIds: string[]
  lastError: ApiErrorPayload | null
  executionOptions: CodexExecutionOptions
  threadSearchTerm: string
  showArchivedThreads: boolean
  threadNextCursor: string | null
  threadLoadRequestId: number
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

const DEFAULT_CODEX_EXECUTION_OPTIONS: CodexExecutionOptions = {
  model: null,
  reasoning_effort: null,
  sandbox_mode: CodexSandboxMode.WorkspaceWrite,
  approval_policy: CodexApprovalPolicy.Untrusted,
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
    pendingThreadStart: null,
    resumedThreadIds: [],
    lastError: null,
    executionOptions: { ...DEFAULT_CODEX_EXECUTION_OPTIONS },
    threadSearchTerm: '',
    showArchivedThreads: false,
    threadNextCursor: null,
    threadLoadRequestId: 0,
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
          const workspace = state.projection.workspacesById[thread.workspace_id]
          return [
            thread.display_name,
            workspace?.display_name ?? '',
            workspace?.default_branch ?? '',
          ].some((value) =>
            value.toLocaleLowerCase().includes(normalizedSearchTerm),
          )
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
    selectedTimeline(state): CodexTimelineItem[] {
      if (!state.selectedThreadId) return []
      const ids =
        state.projection.orderedItemIdsByThread[state.selectedThreadId] ?? []
      return ids.flatMap((itemId) => {
        const item = state.projection.itemsById[itemId]
        return item ? [item] : []
      })
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
    async loadHosts(): Promise<void> {
      if (hostsLoadInFlight) return hostsLoadInFlight
      const generation = sessionLoadGeneration
      this.loading = true
      this.lastError = null
      const request = (async (): Promise<void> => {
        const collection = await createCodexHostsClient().list()
        if (generation !== sessionLoadGeneration) return
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

    async selectHost(hostId: string): Promise<void> {
      const preservedWorkspaceId =
        this.selectedHostId === hostId ? this.selectedWorkspaceId : null
      this.selectedHostId = hostId
      this.selectedWorkspaceId = preservedWorkspaceId
      this.selectedThreadId = null
      this.selectionError = null
      this.workspaceSelectionState = WorkspaceSelectionState.Loading
      await Promise.all([this.loadWorkspaces(), this.loadThreads(null)])
      const workspaceId =
        preservedWorkspaceId ??
        this.workspaces.find((workspace) => workspace.enabled)?.workspace_id ??
        null
      if (workspaceId) this.restoreWorkspace(workspaceId)
      else this.workspaceSelectionState = WorkspaceSelectionState.Missing
      this.resetExecutionOptions()
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
      this.threadSearchTerm = searchTerm.trim()
      await this.loadThreads(workspaceId)
    },

    async setArchivedThreadsVisible(visible: boolean): Promise<void> {
      this.showArchivedThreads = visible
      this.selectedThreadId = null
      await this.loadThreads(this.selectedWorkspaceId)
    },

    async renameThread(
      thread: CodexThread,
      displayName: string,
    ): Promise<void> {
      const normalizedTitle = displayName.trim()
      if (!normalizedTitle) throw new Error('会话标题不能为空。')
      try {
        await createCodexThreadsClient().rename(
          thread.host_id,
          thread.upstream_thread_id,
          { display_name: normalizedTitle },
        )
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
      await createCodexThreadsClient().archive(
        thread.host_id,
        thread.upstream_thread_id,
      )
    },

    async unarchiveThread(thread: CodexThread): Promise<void> {
      await createCodexThreadsClient().unarchive(
        thread.host_id,
        thread.upstream_thread_id,
      )
    },

    async waitForCreatedThread(
      previousIds: Set<string>,
    ): Promise<CodexThread | null> {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await this.loadThreads()
        const created = this.threads.find(
          (thread) => !previousIds.has(thread.upstream_thread_id),
        )
        if (created) {
          this.selectThread(created.upstream_thread_id)
          return created
        }
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      return null
    },

    selectWorkspace(workspaceId: string): void {
      this.restoreWorkspace(workspaceId)
    },

    restoreWorkspace(workspaceId: string): boolean {
      const workspace = this.projection.workspacesById[workspaceId]
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
      this.selectedThreadId = threadId
      const thread = this.projection.threadsById[threadId]
      if (thread) {
        this.selectedHostId = thread.host_id
        this.selectedWorkspaceId = thread.workspace_id
      }
    },

    restoreThread(threadId: string, expectedWorkspaceId?: string): boolean {
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
      this.selectedHostId = hostId
      this.selectedWorkspaceId = null
      await Promise.all([this.loadWorkspaces(), this.loadThreads(null)])
      if (route.threadId) {
        return this.restoreThread(route.threadId, route.workspaceId)
      }
      const workspaceId =
        route.workspaceId ??
        this.selectedWorkspaceId ??
        this.workspaces.find((workspace) => workspace.enabled)?.workspace_id
      if (!workspaceId) {
        this.selectedWorkspaceId = null
        this.workspaceSelectionState = WorkspaceSelectionState.Missing
        this.selectionError = '当前主机没有可用项目。'
        return false
      }
      return this.restoreWorkspace(workspaceId)
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
      historyCursor: string | null = null,
    ): Promise<void> {
      if (!this.selectedHostId || !this.selectedThreadId) return
      const snapshot = await createCodexThreadsClient().read(
        this.selectedHostId,
        this.selectedThreadId,
        historyCursor,
      )
      this.applyRealtimeEvent(
        validateCodexRealtimeEvent({
          header: {
            kind: 'codex_realtime_event',
            schema_version: CODEX_REALTIME_SCHEMA_VERSION,
            stream_epoch: CODEX_REALTIME_STREAM_EPOCH,
            cursor: null,
            event_id: `snapshot-${this.selectedThreadId}-${Date.now()}`,
            occurred_at: new Date().toISOString(),
            host_id: this.selectedHostId,
            workspace_id: snapshot.thread.workspace_id,
            thread_id: this.selectedThreadId,
            turn_id: null,
            item_id: null,
            detail_kind: CodexRealtimeEventType.ThreadSnapshot,
          },
          detail: {
            kind: CodexRealtimeEventType.ThreadSnapshot,
            schema_version: CODEX_REALTIME_SCHEMA_VERSION,
            ...snapshot,
            append_history: historyCursor !== null,
          },
        }),
      )
    },

    async loadMoreHistory(): Promise<void> {
      if (!this.selectedHistoryCursor) return
      await this.loadThreadSnapshot(this.selectedHistoryCursor)
    },

    async ensureThreadReady(): Promise<void> {
      if (!this.selectedHostId || !this.selectedThreadId) {
        throw new Error('继续Codex线程前必须选择线程。')
      }
      if (this.resumedThreadIds.includes(this.selectedThreadId)) return
      await createCodexThreadsClient().resume(
        this.selectedHostId,
        this.selectedThreadId,
      )
      this.resumedThreadIds.push(this.selectedThreadId)
      await this.loadThreadSnapshot()
    },

    async sendMessage(message: string): Promise<CodexOperationAccepted> {
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
      const active = Boolean(thread?.active_turn_id)
      const client = createCodexThreadsClient()
      if (!active) await this.ensureThreadReady()
      const idempotencyKey = createCodexIdempotencyKey()
      const accepted = active
        ? await client.steer(
            hostId,
            threadId,
            {
              message: normalizedMessage,
              execution: this.executionOptions,
            },
            idempotencyKey,
          )
        : await client.startTurn(
            hostId,
            threadId,
            {
              message: normalizedMessage,
              execution: this.executionOptions,
            },
            idempotencyKey,
          )
      this.pendingTurnByThreadId[threadId] = accepted
      this.appendOptimisticUserMessage(normalizedMessage, idempotencyKey)
      await this.loadThreads(thread?.workspace_id ?? this.selectedWorkspaceId)
      return accepted
    },

    async interruptTurn(): Promise<CodexOperationAccepted> {
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
      if (!this.selectedHostId || !this.selectedThreadId) {
        throw new Error('压缩操作前必须选择线程。')
      }
      const accepted = await createCodexThreadsClient().compact(
        this.selectedHostId,
        this.selectedThreadId,
      )
      return accepted
    },

    async refreshAuthority(): Promise<void> {
      await this.loadHosts()
      if (this.selectedHostId) {
        await Promise.all([this.loadWorkspaces(), this.loadThreads()])
        this.resetExecutionOptions()
      }
      if (!this.selectedThreadId) return
      let lastError: unknown
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await this.loadThreadSnapshot()
          return
        } catch (error) {
          lastError = error
          if (attempt < 2) {
            await new Promise((resolve) =>
              setTimeout(resolve, 250 * (attempt + 1)),
            )
          }
        }
      }
      throw lastError
    },

    applyRealtimeEvent(event: CodexRealtimeEvent): void {
      this.projection = reduceCodexRealtimeEvent(this.projection, event)
      if (event.detail.kind === CodexRealtimeEventType.HostSnapshot) {
        this.reconcileSelections()
      }
      if (
        event.header.thread_id &&
        (event.detail.kind === CodexRealtimeEventType.TurnStarted ||
          event.detail.kind === CodexRealtimeEventType.TurnCompleted ||
          event.detail.kind === CodexRealtimeEventType.TurnFailed ||
          event.detail.kind === CodexRealtimeEventType.TurnInterrupted ||
          event.detail.kind === CodexRealtimeEventType.ItemUpsert)
      ) {
        Reflect.deleteProperty(
          this.pendingTurnByThreadId,
          event.header.thread_id,
        )
      }
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

    appendOptimisticUserMessage(message: string, idempotencyKey: string): void {
      if (!this.selectedThreadId) return
      const itemId = `local-${idempotencyKey}`
      const item: CodexTextTimelineItem = {
        header: {
          item_id: itemId,
          thread_id: this.selectedThreadId,
          turn_id: this.selectedThread?.active_turn_id ?? null,
          detail_kind: CodexTimelineItemKind.UserMessage,
          schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
          status: CodexTimelineItemStatus.Completed,
          created_at: new Date().toISOString(),
        },
        detail: {
          kind: CodexTimelineItemKind.UserMessage,
          schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
          text: message,
        },
      }
      this.projection.itemsById[itemId] = item
      this.projection.itemSourceById[itemId] =
        CodexTimelineItemSource.Optimistic
      const current =
        this.projection.orderedItemIdsByThread[this.selectedThreadId] ?? []
      this.projection.orderedItemIdsByThread[this.selectedThreadId] = [
        ...current,
        itemId,
      ]
    },

    clearSession(): void {
      sessionLoadGeneration += 1
      hostsLoadInFlight = null
      workspacesLoadInFlight = null
      threadsLoadInFlight = null
      this.projection = createCodexSessionProjection()
      this.selectedHostId = null
      this.selectedWorkspaceId = null
      this.selectedThreadId = null
      this.pendingTurnByThreadId = {}
      this.pendingThreadStart = null
      this.resumedThreadIds = []
      this.lastError = null
      this.executionOptions = { ...DEFAULT_CODEX_EXECUTION_OPTIONS }
      this.threadSearchTerm = ''
      this.showArchivedThreads = false
      this.threadNextCursor = null
      this.threadLoadRequestId = 0
    },

    resetExecutionOptions(): void {
      const capabilities = this.selectedHost?.capabilities
      const authStore = useAuthStore()
      const allowedSandboxModes = CODEX_SANDBOX_RESTRICTION_ORDER.filter(
        (mode) =>
          capabilities?.sandbox_modes.includes(mode) &&
          (mode !== CodexSandboxMode.DangerFullAccess ||
            authStore.canScope(AuthScope.CodexFullAccess)),
      )
      const allowedApprovalPolicies = CODEX_APPROVAL_RESTRICTION_ORDER.filter(
        (policy) => capabilities?.approval_policies.includes(policy),
      )
      this.executionOptions = {
        model: capabilities?.model_ids[0] ?? null,
        reasoning_effort: capabilities?.reasoning_efforts[0] ?? null,
        sandbox_mode:
          allowedSandboxModes.at(-1) ??
          capabilities?.sandbox_modes[0] ??
          CodexSandboxMode.WorkspaceWrite,
        approval_policy:
          allowedApprovalPolicies.at(-1) ??
          capabilities?.approval_policies[0] ??
          CodexApprovalPolicy.Untrusted,
      }
    },
  },
})
