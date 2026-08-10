import { defineStore } from 'pinia'
import type { ApiErrorPayload } from '~/types/api'
import {
  CodexApprovalPolicy,
  CodexSandboxMode,
  type CodexHost,
} from '~/types/codex-host'
import {
  CodexTimelineItemKind,
  CodexTimelineItemStatus,
  type CodexTextTimelineItem,
  type CodexTimelineItem,
} from '~/types/codex-item'
import {
  CodexRealtimeEventType,
  type CodexRealtimeEvent,
} from '~/types/codex-realtime'
import type {
  CodexExecutionOptions,
  CodexThread,
  CodexThreadHistoryStatus,
} from '~/types/codex-thread'
import type { CodexOperationAccepted } from '~/types/codex-turn'
import type { CodexWorkspace } from '~/types/codex-workspace'
import { createCodexIdempotencyKey } from '~/services/api/codex-api-client'
import {
  createCodexSessionProjection,
  reduceCodexRealtimeEvent,
  type CodexSessionProjection,
} from '~/utils/codex-event-reducer'

interface PendingCodexThreadStart {
  requestKey: string
  idempotencyKey: string
  operation: CodexOperationAccepted | null
}

interface CodexSessionStoreState {
  projection: CodexSessionProjection
  selectedHostId: string | null
  selectedWorkspaceId: string | null
  selectedThreadId: string | null
  loading: boolean
  pendingOperation: CodexOperationAccepted | null
  pendingThreadStart: PendingCodexThreadStart | null
  resumedThreadIds: string[]
  lastError: ApiErrorPayload | null
  executionOptions: CodexExecutionOptions
}

const sortByUpdatedAt = <T extends { updated_at: string }>(items: T[]): T[] =>
  [...items].sort((left, right) =>
    right.updated_at.localeCompare(left.updated_at),
  )

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
    loading: false,
    pendingOperation: null,
    pendingThreadStart: null,
    resumedThreadIds: [],
    lastError: null,
    executionOptions: { ...DEFAULT_CODEX_EXECUTION_OPTIONS },
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
      return items.filter(
        (workspace) => workspace.host_id === state.selectedHostId,
      )
    },
    selectedWorkspace(state): CodexWorkspace | null {
      return state.selectedWorkspaceId
        ? (state.projection.workspacesById[state.selectedWorkspaceId] ?? null)
        : null
    },
    threads(state): CodexThread[] {
      const items = Object.values(state.projection.threadsById).filter(
        (thread) =>
          thread.host_id === state.selectedHostId &&
          (!state.selectedWorkspaceId ||
            thread.workspace_id === state.selectedWorkspaceId),
      )
      return sortByUpdatedAt(items)
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
  },
  actions: {
    async loadHosts(): Promise<void> {
      this.loading = true
      this.lastError = null
      try {
        const collection = await createCodexHostsClient().list()
        this.projection.hostsById = Object.fromEntries(
          collection.items.map((host) => [host.host_id, host]),
        )
        if (
          !this.selectedHostId ||
          !this.projection.hostsById[this.selectedHostId]
        ) {
          this.selectedHostId = collection.items[0]?.host_id ?? null
        }
      } catch (error) {
        this.lastError = error as ApiErrorPayload
        throw error
      } finally {
        this.loading = false
      }
    },

    async selectHost(hostId: string): Promise<void> {
      this.selectedHostId = hostId
      this.selectedWorkspaceId = null
      this.selectedThreadId = null
      await Promise.all([this.loadWorkspaces(), this.loadThreads()])
      this.selectedWorkspaceId = this.workspaces[0]?.workspace_id ?? null
      this.resetExecutionOptions()
    },

    async loadWorkspaces(): Promise<void> {
      if (!this.selectedHostId) return
      const collection = await createCodexWorkspacesClient().list(
        this.selectedHostId,
      )
      for (const workspace of collection.items) {
        this.projection.workspacesById[workspace.workspace_id] = workspace
      }
      if (
        !this.selectedWorkspaceId ||
        !this.projection.workspacesById[this.selectedWorkspaceId]
      ) {
        this.selectedWorkspaceId = collection.items[0]?.workspace_id ?? null
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

    async loadThreads(): Promise<void> {
      if (!this.selectedHostId) return
      const collection = await createCodexThreadsClient().list(
        this.selectedHostId,
      )
      for (const thread of collection.items) {
        this.projection.threadsById[thread.upstream_thread_id] = thread
      }
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
      this.selectedWorkspaceId = workspaceId
      const selectedThread = this.selectedThread
      if (selectedThread?.workspace_id !== workspaceId) {
        this.selectedThreadId = null
      }
    },

    selectThread(threadId: string): void {
      this.selectedThreadId = threadId
      const thread = this.projection.threadsById[threadId]
      if (thread) {
        this.selectedHostId = thread.host_id
        this.selectedWorkspaceId = thread.workspace_id
      }
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
      this.pendingOperation = accepted
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
      this.applyRealtimeEvent({
        kind: 'codex_realtime_event',
        schema_version: '2.0',
        stream_epoch: 'codex-browser-stream-v2',
        cursor: null,
        event_id: `snapshot-${this.selectedThreadId}-${Date.now()}`,
        host_id: this.selectedHostId,
        workspace_id: snapshot.thread.workspace_id,
        thread_id: this.selectedThreadId,
        turn_id: null,
        item_id: null,
        type: CodexRealtimeEventType.ThreadSnapshot,
        payload: { ...snapshot, append_history: historyCursor !== null },
      })
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
      const accepted = await createCodexThreadsClient().resume(
        this.selectedHostId,
        this.selectedThreadId,
      )
      this.pendingOperation = accepted
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
      const thread = this.selectedThread
      const active = Boolean(thread?.active_turn_id)
      const client = createCodexThreadsClient()
      if (!active) await this.ensureThreadReady()
      const idempotencyKey = createCodexIdempotencyKey()
      const accepted = active
        ? await client.steer(
            this.selectedHostId,
            this.selectedThreadId,
            {
              message: normalizedMessage,
              execution: this.executionOptions,
            },
            idempotencyKey,
          )
        : await client.startTurn(
            this.selectedHostId,
            this.selectedThreadId,
            {
              message: normalizedMessage,
              execution: this.executionOptions,
            },
            idempotencyKey,
          )
      this.pendingOperation = accepted
      this.appendOptimisticUserMessage(normalizedMessage, idempotencyKey)
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
      this.pendingOperation = accepted
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
      this.pendingOperation = accepted
      return accepted
    },

    async refreshAuthority(): Promise<void> {
      await this.loadHosts()
      if (this.selectedHostId) {
        await Promise.all([this.loadWorkspaces(), this.loadThreads()])
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
    },

    appendOptimisticUserMessage(message: string, idempotencyKey: string): void {
      if (!this.selectedThreadId) return
      const itemId = `local-${idempotencyKey}`
      const item: CodexTextTimelineItem = {
        item_id: itemId,
        thread_id: this.selectedThreadId,
        turn_id: this.selectedThread?.active_turn_id ?? null,
        kind: CodexTimelineItemKind.UserMessage,
        status: CodexTimelineItemStatus.Completed,
        text: message,
        created_at: new Date().toISOString(),
      }
      this.projection.itemsById[itemId] = item
      const current =
        this.projection.orderedItemIdsByThread[this.selectedThreadId] ?? []
      this.projection.orderedItemIdsByThread[this.selectedThreadId] = [
        ...current,
        itemId,
      ]
    },

    clearSession(): void {
      this.projection = createCodexSessionProjection()
      this.selectedHostId = null
      this.selectedWorkspaceId = null
      this.selectedThreadId = null
      this.pendingOperation = null
      this.pendingThreadStart = null
      this.resumedThreadIds = []
      this.lastError = null
      this.executionOptions = { ...DEFAULT_CODEX_EXECUTION_OPTIONS }
    },

    resetExecutionOptions(): void {
      const capabilities = this.selectedHost?.capabilities
      this.executionOptions = {
        model: capabilities?.model_ids[0] ?? null,
        reasoning_effort: capabilities?.reasoning_efforts[0] ?? null,
        sandbox_mode:
          capabilities?.sandbox_modes[0] ?? CodexSandboxMode.WorkspaceWrite,
        approval_policy:
          capabilities?.approval_policies[0] ?? CodexApprovalPolicy.Untrusted,
      }
    },
  },
})
