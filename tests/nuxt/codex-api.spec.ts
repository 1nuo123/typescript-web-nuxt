import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthSessionStatus } from '~/types/auth'
import { CodexApprovalDecision } from '~/types/codex-approval'
import { CodexApprovalPolicy, CodexSandboxMode } from '~/types/codex-host'
import { createCodexApprovalsClient } from '~/services/api/codex-approvals'
import { createCodexHostsClient } from '~/services/api/codex-hosts'
import { createCodexThreadsClient } from '~/services/api/codex-threads'
import { createCodexWorkspacesClient } from '~/services/api/codex-workspaces'
import { CodexAgentReleaseClient } from '~/services/api/codex-agent-release'
import { CodexEnrollmentClient } from '~/services/api/codex-enrollment'
import { createCodexIdempotencyKey } from '~/services/api/codex-api-client'

const envelope = <T>(data: T) => ({
  header: {
    code: 'system.success.ok',
    message: 'ok',
    request_id: 'request-1',
  },
  data,
})

const authorize = (): void => {
  const authStore = useAuthStore()
  authStore.status = AuthSessionStatus.Authenticated
  authStore.accessToken = 'access-token'
}

describe('Codex API services', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore().$reset()
  })

  it('creates an RFC 4122 UUID when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: vi.fn((bytes: Uint8Array) => {
        bytes.set(Array.from({ length: 16 }, (_, index) => index))
        return bytes
      }),
    })

    expect(createCodexIdempotencyKey()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('loads host collections through the authenticated response envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(envelope({ items: [] }))
    vi.stubGlobal('$fetch', fetchMock)
    authorize()

    await expect(createCodexHostsClient().list()).resolves.toEqual({
      items: [],
    })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/codex/hosts')
    const options = fetchMock.mock.calls[0]?.[1] as { headers: Headers }
    expect(options.headers.get('Authorization')).toBe('Bearer access-token')
  })

  it('encodes thread ids and sends a stable idempotency key for turn commands', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      envelope({
        operation_id: 'operation-1',
        command_id: 'command-1',
        status: 'acknowledged',
        replayed: false,
      }),
    )
    vi.stubGlobal('$fetch', fetchMock)
    authorize()

    await createCodexThreadsClient().startTurn('host-1', 'thread/with spaces', {
      client_operation_id: 'idem-1',
      message: '继续',
      execution: {
        model: null,
        reasoning_effort: null,
        sandbox_mode: CodexSandboxMode.WorkspaceWrite,
        approval_policy: CodexApprovalPolicy.Untrusted,
      },
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/codex/hosts/host-1/threads/thread%2Fwith%20spaces/turns',
    )
    const options = fetchMock.mock.calls[0]?.[1] as {
      body: { client_operation_id: string; message: string; execution: unknown }
      headers: Headers
    }
    expect(options.body).toEqual({
      client_operation_id: 'idem-1',
      message: '继续',
      execution: {
        model: null,
        reasoning_effort: null,
        sandbox_mode: CodexSandboxMode.WorkspaceWrite,
        approval_policy: CodexApprovalPolicy.Untrusted,
      },
    })
    expect(options.headers.get('Idempotency-Key')).toBe('idem-1')
  })

  it('sends approval id, version and idempotency key without widening the decision payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      envelope({
        operation_id: 'operation-approval-1',
        command_id: 'command-approval-1',
        status: 'acknowledged',
        replayed: false,
      }),
    )
    vi.stubGlobal('$fetch', fetchMock)
    authorize()

    await createCodexApprovalsClient().decide(
      'approval/with spaces',
      CodexApprovalDecision.Accept,
      7,
      'step-up-token',
      'approval-idempotency-key',
    )

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/codex/approvals/approval%2Fwith%20spaces/decision',
    )
    const options = fetchMock.mock.calls[0]?.[1] as {
      body: { decision: CodexApprovalDecision; approval_version: number }
      headers: Headers
    }
    expect(options.body).toEqual({
      decision: CodexApprovalDecision.Accept,
      approval_version: 7,
    })
    expect(options.headers.get('Idempotency-Key')).toBe(
      'approval-idempotency-key',
    )
    expect(options.headers.get('X-Step-Up-Token')).toBe('step-up-token')
  })

  it('uses distinct steer and interrupt product endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      envelope({
        operation_id: 'operation-1',
        command_id: 'command-1',
        status: 'acknowledged',
        replayed: false,
      }),
    )
    vi.stubGlobal('$fetch', fetchMock)
    authorize()
    const client = createCodexThreadsClient()

    await client.steer('host-1', 'thread-1', {
      client_operation_id: 'idem-2',
      message: '补充',
      execution: {
        model: null,
        reasoning_effort: null,
        sandbox_mode: CodexSandboxMode.WorkspaceWrite,
        approval_policy: CodexApprovalPolicy.Untrusted,
      },
    })
    await client.interrupt('host-1', 'thread-1', 'idem-3')

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/codex/hosts/host-1/threads/thread-1/steer',
      '/codex/hosts/host-1/threads/thread-1/interrupt',
    ])
  })

  it('uses typed conversation list, rename, pin, archive and restore endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      envelope({
        operation_id: 'operation-1',
        command_id: 'command-1',
        status: 'acknowledged',
        replayed: false,
      }),
    )
    vi.stubGlobal('$fetch', fetchMock)
    authorize()
    const client = createCodexThreadsClient()

    await client.list('host/with spaces', {
      workspace_id: 'workspace-1',
      archived: true,
      search_term: '会话标题',
      cursor: 'cursor-1',
      limit: 25,
    })
    await client.rename(
      'host-1',
      'thread/with spaces',
      { display_name: '手工标题' },
      'idem-rename',
    )
    await client.updatePin('host-1', 'thread-1', { is_pinned: true })
    await client.archive('host-1', 'thread-1', 'idem-archive')
    await client.unarchive('host-1', 'thread-1', 'idem-unarchive')

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/codex/hosts/host%2Fwith%20spaces/threads',
      '/codex/hosts/host-1/threads/thread%2Fwith%20spaces/name',
      '/codex/hosts/host-1/threads/thread-1/pin',
      '/codex/hosts/host-1/threads/thread-1/archive',
      '/codex/hosts/host-1/threads/thread-1/unarchive',
    ])
    const listOptions = fetchMock.mock.calls[0]?.[1] as {
      query: Record<string, string | number | boolean>
    }
    expect(listOptions.query).toEqual({
      workspace_id: 'workspace-1',
      archived: true,
      search_term: '会话标题',
      cursor: 'cursor-1',
      limit: 25,
    })
    const renameOptions = fetchMock.mock.calls[1]?.[1] as {
      body: { display_name: string }
      headers: Headers
    }
    expect(renameOptions.body).toEqual({ display_name: '手工标题' })
    expect(renameOptions.headers.get('Idempotency-Key')).toBe('idem-rename')
    const pinOptions = fetchMock.mock.calls[2]?.[1] as {
      body: { is_pinned: boolean }
    }
    expect(pinOptions.body).toEqual({ is_pinned: true })
    const archiveOptions = fetchMock.mock.calls[3]?.[1] as {
      headers: Headers
    }
    const unarchiveOptions = fetchMock.mock.calls[4]?.[1] as {
      headers: Headers
    }
    expect(archiveOptions.headers.get('Idempotency-Key')).toBe('idem-archive')
    expect(unarchiveOptions.headers.get('Idempotency-Key')).toBe(
      'idem-unarchive',
    )
  })

  it('uses the signed before-cursor history endpoint without offset fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      envelope({
        items: [],
        before_cursor: null,
        has_more: false,
        history_revision: 'a'.repeat(64),
      }),
    )
    vi.stubGlobal('$fetch', fetchMock)
    authorize()

    const client = createCodexThreadsClient()
    await client.read('host-1', 'thread-1')
    await client.readHistory('host-1', 'thread-1', 'signed-before', 25)

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/codex/hosts/host-1/threads/thread-1',
      '/codex/hosts/host-1/threads/thread-1/history',
    ])
    const initialOptions = fetchMock.mock.calls[0]?.[1] as {
      query: Record<string, string | number | boolean>
    }
    const historyOptions = fetchMock.mock.calls[1]?.[1] as {
      query: Record<string, string | number | boolean>
    }
    expect(initialOptions.query).toEqual({
      include_history: true,
      history_limit: 50,
    })
    expect(historyOptions.query).toEqual({
      before_cursor: 'signed-before',
      limit: 25,
    })
  })

  it('reloads reclaimed history bodies only by stable item ids', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        envelope({ items: [], missing_item_ids: ['item-missing'] }),
      )
    vi.stubGlobal('$fetch', fetchMock)
    authorize()

    await expect(
      createCodexThreadsClient().readHistoryItems(
        'host/with spaces',
        'thread/with spaces',
        ['item-1', 'item-missing'],
      ),
    ).resolves.toEqual({ items: [], missing_item_ids: ['item-missing'] })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/codex/hosts/host%2Fwith%20spaces/threads/thread%2Fwith%20spaces/history/items',
    )
    const options = fetchMock.mock.calls[0]?.[1] as {
      query: { item_id: string[] }
    }
    expect(options.query).toEqual({ item_id: ['item-1', 'item-missing'] })
  })

  it('reads and writes workspace execution preferences through the typed endpoint', async () => {
    const response = {
      workspace_id: 'workspace-1',
      effective_preferences: {
        model: 'gpt-5.6',
        reasoning_effort: 'high',
        sandbox_mode: CodexSandboxMode.WorkspaceWrite,
        approval_policy: CodexApprovalPolicy.OnRequest,
        capabilities_revision: 'a'.repeat(64),
      },
      adjusted_fields: ['sandbox_mode'],
    }
    const fetchMock = vi.fn().mockResolvedValue(envelope(response))
    vi.stubGlobal('$fetch', fetchMock)
    authorize()

    const client = createCodexWorkspacesClient()
    await expect(
      client.readExecutionPreferences(
        'host/with spaces',
        'workspace/with spaces',
      ),
    ).resolves.toEqual(response)
    await expect(
      client.updateExecutionPreferences(
        'host/with spaces',
        'workspace/with spaces',
        {
          expected_revision: 0,
          requested: { model: null, reasoning_effort: null, permission_mode: 'full_access' },
        },
      ),
    ).resolves.toEqual(response)

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/codex/hosts/host%2Fwith%20spaces/workspaces/workspace%2Fwith%20spaces/preferences',
      '/codex/hosts/host%2Fwith%20spaces/workspaces/workspace%2Fwith%20spaces/preferences',
    ])
    const writeOptions = fetchMock.mock.calls[1]?.[1] as {
      method: string
      body: {
        sandbox_mode: CodexSandboxMode
        approval_policy: CodexApprovalPolicy
      }
    }
    expect(writeOptions.method).toBe('PUT')
    expect(writeOptions.body).toMatchObject({
      sandbox_mode: CodexSandboxMode.DangerFullAccess,
      approval_policy: CodexApprovalPolicy.Never,
    })
  })

  it('uses typed release and enrollment product endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue(envelope({ items: [] }))
    vi.stubGlobal('$fetch', fetchMock)
    authorize()

    const enrollmentClient = new CodexEnrollmentClient()
    await new CodexAgentReleaseClient().readCurrent()
    await enrollmentClient.create()
    await enrollmentClient.read('intent/with spaces')

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/codex/agent-release/current',
      '/codex/enrollment-intents',
      '/codex/enrollment-intents/intent%2Fwith%20spaces',
    ])
    const createOptions = fetchMock.mock.calls[1]?.[1] as {
      body: {
        header: { kind: string; schema_version: string; request_id: string }
        detail: { return_path: string }
      }
    }
    expect(createOptions.body.header).toMatchObject({
      kind: 'codex_enrollment_intent',
      schema_version: '1.0',
    })
    expect(createOptions.body.header.request_id).toBeTruthy()
    expect(createOptions.body.detail.return_path).toBe('/codex/verify-device')
  })
})
