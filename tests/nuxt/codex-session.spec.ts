import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CodexThreadStatus,
  CodexThreadTitleSource,
  type CodexThread,
} from '~/types/codex-thread'
import { CodexApprovalPolicy, CodexSandboxMode } from '~/types/codex-host'
import type { CodexWorkspace } from '~/types/codex-workspace'
import {
  CodexTimelineItemSource,
  CodexTimelineItemStatus,
} from '~/types/codex-item'
import { CodexContextView } from '~/stores/codex-ui'
import {
  CODEX_REALTIME_SCHEMA_VERSION,
  CodexRealtimeConnectionStatus,
  CodexRealtimeEventType,
} from '~/types/codex-realtime'

const THREAD_TIMESTAMP = '2026-08-15T08:00:00Z'

const envelope = <T>(data: T) => ({
  header: {
    code: 'system.success.ok',
    message: 'ok',
    request_id: 'request-1',
  },
  data,
})

const thread = (overrides: Partial<CodexThread> = {}): CodexThread => ({
  thread_index_id: 'index-1',
  host_id: 'host-1',
  workspace_id: 'workspace-1',
  owner_subject_id: 'subject-1',
  upstream_thread_id: 'thread-1',
  display_name: '会话一',
  title_source: CodexThreadTitleSource.AppServer,
  model: null,
  model_provider: null,
  reasoning_effort: null,
  status: CodexThreadStatus.Idle,
  active_turn_id: null,
  turn_runtime: null,
  archived: false,
  is_pinned: false,
  source_kind: 'app_server',
  created_at: THREAD_TIMESTAMP,
  recency_at: THREAD_TIMESTAMP,
  updated_at: THREAD_TIMESTAMP,
  last_synced_at: THREAD_TIMESTAMP,
  ...overrides,
})

describe('Codex session store', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    useCodexRealtimeStore().$reset()
    useCodexSessionStore().clearSession()
    useCodexUiStore().clearUi()
    useAuthStore().$reset()
    localStorage.clear()
  })

  it('sorts pinned conversations first and uses every stable descending key', () => {
    const store = useCodexSessionStore()
    store.selectedHostId = 'host-1'
    store.selectedWorkspaceId = 'workspace-1'
    const conversations = [
      thread({
        upstream_thread_id: 'thread-a',
        display_name: 'A',
        recency_at: '2026-08-15T10:00:00Z',
      }),
      thread({
        upstream_thread_id: 'thread-c',
        display_name: 'C',
        recency_at: '2026-08-15T10:00:00Z',
      }),
      thread({
        upstream_thread_id: 'thread-b',
        display_name: 'B',
        recency_at: '2026-08-15T10:00:00Z',
      }),
      thread({
        upstream_thread_id: 'thread-pinned',
        display_name: 'Pinned',
        is_pinned: true,
        recency_at: '2026-08-14T10:00:00Z',
      }),
      thread({
        upstream_thread_id: 'thread-newer-created',
        display_name: 'Created',
        recency_at: '2026-08-15T10:00:00Z',
        created_at: '2026-08-15T09:00:00Z',
      }),
    ]
    store.projection.threadsById = Object.fromEntries(
      conversations.map((conversation) => [
        conversation.upstream_thread_id,
        conversation,
      ]),
    )

    expect(
      store.threads.map((conversation) => conversation.upstream_thread_id),
    ).toEqual([
      'thread-pinned',
      'thread-newer-created',
      'thread-c',
      'thread-b',
      'thread-a',
    ])
  })

  it('thread_search_matches_title_only', () => {
    const store = useCodexSessionStore()
    store.selectedHostId = 'host-1'
    store.selectedWorkspaceId = 'workspace-1'
    store.threadSearchTerm = 'release'
    const workspace: CodexWorkspace = {
      workspace_id: 'workspace-1',
      host_id: 'host-1',
      owner_subject_id: 'subject-1',
      agent_workspace_key: 'workspace-key',
      display_name: 'release workspace',
      repo_fingerprint: null,
      default_branch: 'release',
      worktree_policy: {
        enabled: false,
        base_branch: 'main',
        max_active: 1,
        retention_seconds: 0,
        disk_watermark_percent: 90,
      },
      execution_preferences: {
        model: null,
        reasoning_effort: null,
        sandbox_mode: CodexSandboxMode.WorkspaceWrite,
        approval_policy: CodexApprovalPolicy.Untrusted,
        capabilities_revision: 'revision-1',
      },
      is_pinned: false,
      enabled: true,
      created_at: THREAD_TIMESTAMP,
      updated_at: THREAD_TIMESTAMP,
      version: 1,
    }
    store.projection.workspacesById[workspace.workspace_id] = workspace
    store.projection.threadsById = {
      'title-match': thread({
        upstream_thread_id: 'title-match',
        display_name: 'Release checklist',
      }),
      'workspace-match': thread({
        upstream_thread_id: 'workspace-match',
        display_name: 'Unrelated title',
      }),
    }

    expect(store.threads.map((item) => item.upstream_thread_id)).toEqual([
      'title-match',
    ])

    store.threadSearchTerm = 'release workspace'
    expect(store.threads).toEqual([])
    store.threadSearchTerm = 'release'
    expect(store.threads).not.toContainEqual(
      expect.objectContaining({ upstream_thread_id: 'workspace-match' }),
    )
  })

  it('coalesces concurrent history loads and drops a response after selection cleanup', async () => {
    let resolveHistory:
      | ((value: ReturnType<typeof envelope<unknown>>) => void)
      | undefined
    const fetchMock = vi.fn(
      () =>
        new Promise<ReturnType<typeof envelope<unknown>>>((resolve) => {
          resolveHistory = resolve
        }),
    )
    vi.stubGlobal('$fetch', fetchMock)
    const store = useCodexSessionStore()
    store.selectedHostId = 'host-1'
    store.selectedThreadId = 'thread-1'
    store.projection.historyCursorByThread['thread-1'] = 'cursor-1'

    const firstRequest = store.loadMoreHistory()
    const duplicateRequest = store.loadMoreHistory()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    store.clearSession()
    resolveHistory!(
      envelope({
        items: [],
        before_cursor: null,
        has_more: false,
        history_revision: 'a'.repeat(64),
      }),
    )
    await Promise.all([firstRequest, duplicateRequest])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(store.projection.historyCursorByThread['thread-1']).toBeUndefined()
  })

  it('coalesces concurrent authority loads and ignores a response after session cleanup', async () => {
    let resolveFetch:
      | ((value: ReturnType<typeof envelope<{ items: never[] }>>) => void)
      | null = null
    const fetchMock = vi.fn(
      () =>
        new Promise<ReturnType<typeof envelope<{ items: never[] }>>>(
          (resolve) => {
            resolveFetch = resolve
          },
        ),
    )
    vi.stubGlobal('$fetch', fetchMock)
    const store = useCodexSessionStore()

    const first = store.loadHosts()
    const second = store.loadHosts()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    store.clearSession()
    resolveFetch!(envelope({ items: [] }))
    await Promise.all([first, second])

    expect(store.hosts).toEqual([])
    expect(store.selectedHostId).toBeNull()
  })

  it('coalesces concurrent state sync into one authority read', async () => {
    let resolveSnapshot: (() => void) | undefined
    const store = useCodexSessionStore()
    store.selectedHostId = 'host-1'
    store.selectedWorkspaceId = 'workspace-1'
    store.selectedThreadId = 'thread-1'
    vi.spyOn(store, 'loadHosts').mockResolvedValue()
    vi.spyOn(store, 'loadWorkspaces').mockResolvedValue()
    vi.spyOn(store, 'loadThreads').mockResolvedValue()
    const loadThreadSnapshot = vi
      .spyOn(store, 'loadThreadSnapshot')
      .mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveSnapshot = resolve
          }),
      )

    const first = store.refreshAuthority()
    const second = store.refreshAuthority()

    await vi.waitFor(() => expect(loadThreadSnapshot).toHaveBeenCalledTimes(1))
    resolveSnapshot!()
    await Promise.all([first, second])

    expect(store.loadHosts).toHaveBeenCalledTimes(1)
    expect(store.loadWorkspaces).toHaveBeenCalledTimes(1)
    expect(store.loadThreads).toHaveBeenCalledTimes(1)
    expect(loadThreadSnapshot).toHaveBeenCalledTimes(1)
  })

  it('replays realtime events received while a thread snapshot is in flight', async () => {
    let resolveSnapshot:
      | ((value: ReturnType<typeof envelope<unknown>>) => void)
      | undefined
    const fetchMock = vi.fn(
      () =>
        new Promise<ReturnType<typeof envelope<unknown>>>((resolve) => {
          resolveSnapshot = resolve
        }),
    )
    vi.stubGlobal('$fetch', fetchMock)
    const store = useCodexSessionStore()
    const activeThread = thread()
    store.selectedHostId = activeThread.host_id
    store.selectedWorkspaceId = activeThread.workspace_id
    store.selectedThreadId = activeThread.upstream_thread_id
    store.projection.threadsById[activeThread.upstream_thread_id] = activeThread

    const loading = store.loadThreadSnapshot()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    store.applyRealtimeEvent({
      header: {
        kind: 'codex_realtime_event',
        schema_version: CODEX_REALTIME_SCHEMA_VERSION,
        stream_epoch: 'epoch-1',
        cursor: 'cursor-1',
        event_id: 'event-during-snapshot',
        occurred_at: THREAD_TIMESTAMP,
        host_id: activeThread.host_id,
        workspace_id: activeThread.workspace_id,
        thread_id: activeThread.upstream_thread_id,
        turn_id: null,
        item_id: null,
        detail_kind: CodexRealtimeEventType.ProtocolWarning,
      },
      detail: {
        kind: CodexRealtimeEventType.ProtocolWarning,
        schema_version: CODEX_REALTIME_SCHEMA_VERSION,
        warning: 'snapshot race preserved',
      },
    })
    resolveSnapshot!(
      envelope({
        thread: activeThread,
        turns: [],
        items: [],
        history_status: 'complete',
        history_before_cursor: null,
        history_has_more: false,
        history_revision: null,
      }),
    )
    await loading

    expect(store.projection.protocolWarnings).toEqual([
      'snapshot race preserved',
    ])
    expect(store.snapshotRecoveryInFlight).toBe(false)
  })

  it('blocks sends for archived conversations before any network request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('$fetch', fetchMock)
    const store = useCodexSessionStore()
    const archived = thread({
      archived: true,
      status: CodexThreadStatus.Archived,
    })
    store.selectedHostId = archived.host_id
    store.selectedWorkspaceId = archived.workspace_id
    store.selectedThreadId = archived.upstream_thread_id
    store.projection.threadsById[archived.upstream_thread_id] = archived

    await expect(store.sendMessage('继续')).rejects.toThrow(
      '已归档会话不能发送新消息。',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    [CodexRealtimeConnectionStatus.Offline, '当前离线，不能发送新消息。'],
    [
      CodexRealtimeConnectionStatus.AuthBlocked,
      '登录状态已失效，不能发送新消息。',
    ],
    [
      CodexRealtimeConnectionStatus.Resyncing,
      '实时状态同步中，暂时不能发送消息。',
    ],
  ])('does not submit while realtime status is %s', async (status, message) => {
    const fetchMock = vi.fn()
    vi.stubGlobal('$fetch', fetchMock)
    const store = useCodexSessionStore()
    const activeThread = thread({ active_turn_id: 'turn-1' })
    store.selectedHostId = activeThread.host_id
    store.selectedWorkspaceId = activeThread.workspace_id
    store.selectedThreadId = activeThread.upstream_thread_id
    store.projection.threadsById[activeThread.upstream_thread_id] = activeThread
    useCodexRealtimeStore().status = status

    await expect(store.sendMessage('不能进入待发送队列')).rejects.toThrow(
      message,
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(store.projection.itemsById).toEqual({})
    expect(store.failedTurnByOperationId).toEqual({})
  })

  it.each([
    [
      'interrupt',
      CodexRealtimeConnectionStatus.AuthBlocked,
      '登录状态已失效',
      (store: ReturnType<typeof useCodexSessionStore>) => store.interruptTurn(),
    ],
    [
      'compact',
      CodexRealtimeConnectionStatus.AuthBlocked,
      '登录状态已失效',
      (store: ReturnType<typeof useCodexSessionStore>) => store.compactThread(),
    ],
    [
      'interrupt',
      CodexRealtimeConnectionStatus.Resyncing,
      '实时状态同步中',
      (store: ReturnType<typeof useCodexSessionStore>) => store.interruptTurn(),
    ],
    [
      'compact',
      CodexRealtimeConnectionStatus.Resyncing,
      '实时状态同步中',
      (store: ReturnType<typeof useCodexSessionStore>) => store.compactThread(),
    ],
  ])(
    'freezes %s when the realtime connection is %s',
    async (_, status, expectedMessage, run) => {
      const fetchMock = vi.fn()
      vi.stubGlobal('$fetch', fetchMock)
      const store = useCodexSessionStore()
      const activeThread = thread({ active_turn_id: 'turn-1' })
      store.selectedHostId = activeThread.host_id
      store.selectedWorkspaceId = activeThread.workspace_id
      store.selectedThreadId = activeThread.upstream_thread_id
      store.projection.threadsById[activeThread.upstream_thread_id] =
        activeThread
      useCodexRealtimeStore().status = status

      await expect(run(store)).rejects.toThrow(expectedMessage)

      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it('shows an optimistic message before the turn HTTP request resolves', async () => {
    let resolveRequest:
      | ((value: ReturnType<typeof envelope<unknown>>) => void)
      | undefined
    const fetchMock = vi.fn(
      () =>
        new Promise<ReturnType<typeof envelope<unknown>>>((resolve) => {
          resolveRequest = resolve
        }),
    )
    vi.stubGlobal('$fetch', fetchMock)
    const store = useCodexSessionStore()
    const activeThread = thread({ active_turn_id: 'turn-1' })
    store.selectedHostId = activeThread.host_id
    store.selectedWorkspaceId = activeThread.workspace_id
    store.selectedThreadId = activeThread.upstream_thread_id
    store.projection.threadsById[activeThread.upstream_thread_id] = activeThread

    const sending = store.sendMessage('立即显示')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const itemId = Object.keys(store.projection.itemsById).find((candidate) =>
      candidate.startsWith('local-'),
    )

    expect(itemId).toBeTruthy()
    expect(store.projection.itemSourceById[itemId!]).toBe(
      CodexTimelineItemSource.Optimistic,
    )
    expect(store.projection.itemsById[itemId!]?.header.status).toBe(
      CodexTimelineItemStatus.Streaming,
    )
    resolveRequest!(
      envelope({
        operation_id: 'operation-1',
        command_id: 'command-1',
        client_operation_id: null,
        status: 'acknowledged',
        replayed: false,
      }),
    )
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    resolveRequest!(envelope({ items: [activeThread], next_cursor: null }))
    await sending
  })

  it('send_duplicate_text_creates_two_items', () => {
    const store = useCodexSessionStore()
    const activeThread = thread({ active_turn_id: 'turn-1' })
    store.selectedThreadId = activeThread.upstream_thread_id
    store.projection.threadsById[activeThread.upstream_thread_id] = activeThread

    store.appendOptimisticUserMessage('相同正文', 'operation-1')
    store.appendOptimisticUserMessage('相同正文', 'operation-2')

    expect(
      store.projection.orderedItemIdsByThread[activeThread.upstream_thread_id],
    ).toEqual(['local-operation-1', 'local-operation-2'])
    expect(
      store.projection.itemsById['local-operation-1']?.detail,
    ).toMatchObject({ text: '相同正文' })
    expect(
      store.projection.itemsById['local-operation-2']?.detail,
    ).toMatchObject({ text: '相同正文' })
  })

  it('reuses a stable selected timeline projection until an item is appended', () => {
    const store = useCodexSessionStore()
    const activeThread = thread({ active_turn_id: 'turn-1' })
    store.selectedThreadId = activeThread.upstream_thread_id
    store.projection.threadsById[activeThread.upstream_thread_id] = activeThread

    store.appendOptimisticUserMessage('第一项', 'operation-1')
    const firstRead = store.selectedTimeline
    const secondRead = store.selectedTimeline

    expect(secondRead).toBe(firstRead)
    expect(Object.isFrozen(firstRead)).toBe(true)

    store.appendOptimisticUserMessage('第二项', 'operation-2')
    expect(store.selectedTimeline).not.toBe(firstRead)
    expect(store.selectedTimeline).toHaveLength(2)
  })

  it('retries a failed message with its original client operation id', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('连接超时'))
      .mockResolvedValueOnce(
        envelope({
          operation_id: 'operation-1',
          command_id: 'command-1',
          client_operation_id: null,
          status: 'acknowledged',
          replayed: false,
        }),
      )
      .mockResolvedValueOnce(
        envelope({
          items: [thread({ active_turn_id: 'turn-1' })],
          next_cursor: null,
        }),
      )
    vi.stubGlobal('$fetch', fetchMock)
    const store = useCodexSessionStore()
    const activeThread = thread({ active_turn_id: 'turn-1' })
    store.selectedHostId = activeThread.host_id
    store.selectedWorkspaceId = activeThread.workspace_id
    store.selectedThreadId = activeThread.upstream_thread_id
    store.projection.threadsById[activeThread.upstream_thread_id] = activeThread

    await expect(store.sendMessage('仅重试一次')).rejects.toThrow('连接超时')
    const clientOperationId = Object.keys(store.failedTurnByOperationId)[0]

    expect(clientOperationId).toBeTruthy()
    expect(
      store.projection.itemsById[`local-${clientOperationId}`]?.header.status,
    ).toBe(CodexTimelineItemStatus.Failed)
    await store.retryMessage(clientOperationId!)

    const firstOptions = fetchMock.mock.calls[0]?.[1] as {
      body: { client_operation_id: string }
      headers: Headers
    }
    const retryOptions = fetchMock.mock.calls[1]?.[1] as {
      body: { client_operation_id: string }
      headers: Headers
    }
    expect(retryOptions.body.client_operation_id).toBe(
      firstOptions.body.client_operation_id,
    )
    expect(retryOptions.headers.get('Idempotency-Key')).toBe(
      firstOptions.headers.get('Idempotency-Key'),
    )
    expect(store.failedTurnByOperationId[clientOperationId!]).toBeUndefined()
    expect(
      store.projection.itemsById[`local-${clientOperationId}`]?.header.status,
    ).toBe(CodexTimelineItemStatus.Streaming)
  })

  it('send_edit_creates_new_operation_id', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('连接超时'))
      .mockResolvedValueOnce(
        envelope({
          operation_id: 'operation-edited',
          command_id: 'command-edited',
          client_operation_id: null,
          status: 'acknowledged',
          replayed: false,
        }),
      )
      .mockResolvedValueOnce(
        envelope({
          items: [thread({ active_turn_id: 'turn-1' })],
          next_cursor: null,
        }),
      )
    vi.stubGlobal('$fetch', fetchMock)
    const store = useCodexSessionStore()
    const activeThread = thread({ active_turn_id: 'turn-1' })
    store.selectedHostId = activeThread.host_id
    store.selectedWorkspaceId = activeThread.workspace_id
    store.selectedThreadId = activeThread.upstream_thread_id
    store.projection.threadsById[activeThread.upstream_thread_id] = activeThread

    await expect(store.sendMessage('原始内容')).rejects.toThrow('连接超时')
    const failedOperationId = Object.keys(store.failedTurnByOperationId)[0]
    expect(failedOperationId).toBeTruthy()

    await store.sendMessage('编辑后的内容')

    const editedOperationId = (
      fetchMock.mock.calls[1]?.[1] as {
        body: { client_operation_id: string }
      }
    ).body.client_operation_id
    expect(editedOperationId).not.toBe(failedOperationId)
    expect(
      fetchMock.mock.calls[1]?.[1] &&
        (fetchMock.mock.calls[1]?.[1] as { headers: Headers }).headers.get(
          'Idempotency-Key',
        ),
    ).toBe(editedOperationId)

    const orderedIds =
      store.projection.orderedItemIdsByThread[activeThread.upstream_thread_id]
    expect(orderedIds).toEqual([
      `local-${failedOperationId}`,
      `local-${editedOperationId}`,
    ])
    expect(
      store.projection.itemsById[`local-${failedOperationId}`]?.header.status,
    ).toBe(CodexTimelineItemStatus.Failed)
    expect(
      store.projection.itemsById[`local-${failedOperationId}`]?.detail,
    ).toMatchObject({ kind: 'user_message', text: '原始内容' })
    expect(
      store.projection.itemsById[`local-${editedOperationId}`]?.detail,
    ).toMatchObject({ kind: 'user_message', text: '编辑后的内容' })
    expect(store.failedTurnByOperationId[failedOperationId!]).toBeDefined()
  })

  it('does not retry a failed message while offline', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('连接超时'))
    vi.stubGlobal('$fetch', fetchMock)
    const store = useCodexSessionStore()
    const activeThread = thread({ active_turn_id: 'turn-1' })
    store.selectedHostId = activeThread.host_id
    store.selectedWorkspaceId = activeThread.workspace_id
    store.selectedThreadId = activeThread.upstream_thread_id
    store.projection.threadsById[activeThread.upstream_thread_id] = activeThread

    await expect(store.sendMessage('等待用户重试')).rejects.toThrow('连接超时')
    const clientOperationId = Object.keys(store.failedTurnByOperationId)[0]
    useCodexRealtimeStore().markOffline()

    await expect(store.retryMessage(clientOperationId!)).rejects.toThrow(
      '当前离线，不能发送新消息。',
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(
      store.projection.itemsById[`local-${clientOperationId}`]?.header.status,
    ).toBe(CodexTimelineItemStatus.Failed)
  })

  it('marks a timeout as confirmation-required without automatically retrying', async () => {
    const timeout = Object.assign(new Error('请求超时'), {
      name: 'TimeoutError',
    })
    const fetchMock = vi.fn().mockRejectedValueOnce(timeout)
    vi.stubGlobal('$fetch', fetchMock)
    const store = useCodexSessionStore()
    const activeThread = thread({ active_turn_id: 'turn-1' })
    store.selectedHostId = activeThread.host_id
    store.selectedWorkspaceId = activeThread.workspace_id
    store.selectedThreadId = activeThread.upstream_thread_id
    store.projection.threadsById[activeThread.upstream_thread_id] = activeThread

    await expect(store.sendMessage('等待服务端确认')).rejects.toThrow(
      '请求超时',
    )
    const clientOperationId = Object.keys(store.failedTurnByOperationId)[0]

    expect(store.confirmationRequiredOperationIds).toEqual([clientOperationId])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(
      store.projection.itemsById[`local-${clientOperationId}`]?.header.status,
    ).toBe(CodexTimelineItemStatus.Failed)
  })

  it('exposes only the selected conversation pending turn', () => {
    const store = useCodexSessionStore()
    store.pendingTurnByThreadId = {
      'thread-one': {
        operation_id: 'operation-one',
        command_id: 'command-one',
        client_operation_id: null,
        status: 'acknowledged',
        replayed: false,
      },
      'thread-two': {
        operation_id: 'operation-two',
        command_id: 'command-two',
        client_operation_id: null,
        status: 'acknowledged',
        replayed: false,
      },
    }

    store.selectedThreadId = 'thread-one'
    expect(store.selectedPendingTurn?.operation_id).toBe('operation-one')
    store.selectedThreadId = 'thread-two'
    expect(store.selectedPendingTurn?.operation_id).toBe('operation-two')
    store.selectedThreadId = 'thread-empty'
    expect(store.selectedPendingTurn).toBeNull()
  })
})

describe('Codex UI resource retention', () => {
  afterEach(() => {
    useCodexUiStore().clearUi()
  })

  it('bounds drafts and clears transient context without discarding retained drafts', () => {
    const store = useCodexUiStore()
    for (let index = 0; index < 30; index += 1) {
      store.setDraft(`thread-${index}`, `draft-${index}`)
    }
    store.mobilePanelOpen = true
    store.openContext(CodexContextView.Output, 'item-1')

    store.clearTransientUi()

    expect(Object.keys(store.draftsByThreadId)).toHaveLength(24)
    expect(store.draftsByThreadId['thread-0']).toBeUndefined()
    expect(store.draftsByThreadId['thread-29']).toBe('draft-29')
    expect(store.mobilePanelOpen).toBe(false)
    expect(store.contextPanelOpen).toBe(false)
    expect(store.selectedContextItemId).toBeNull()
  })

  it('keeps thread-list scroll positions in memory per filtered route', () => {
    const store = useCodexUiStore()

    store.setThreadListScrollPosition('active-project', 184)
    store.setThreadListScrollPosition('archived-search', -12)

    expect(store.threadListScrollTopByRouteKey).toEqual({
      'active-project': 184,
      'archived-search': 0,
    })
  })
})
