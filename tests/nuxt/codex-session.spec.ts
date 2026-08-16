import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CodexThreadStatus,
  CodexThreadTitleSource,
  type CodexThread,
} from '~/types/codex-thread'
import { CodexContextView } from '~/stores/codex-ui'

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
    vi.unstubAllGlobals()
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

  it('exposes only the selected conversation pending turn', () => {
    const store = useCodexSessionStore()
    store.pendingTurnByThreadId = {
      'thread-one': {
        operation_id: 'operation-one',
        command_id: 'command-one',
        status: 'acknowledged',
        replayed: false,
      },
      'thread-two': {
        operation_id: 'operation-two',
        command_id: 'command-two',
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
})
