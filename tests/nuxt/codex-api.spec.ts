import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthSessionStatus } from '~/types/auth'
import { CodexApprovalPolicy, CodexSandboxMode } from '~/types/codex-host'
import { createCodexHostsClient } from '~/services/api/codex-hosts'
import { createCodexThreadsClient } from '~/services/api/codex-threads'
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

    await createCodexThreadsClient().startTurn(
      'host-1',
      'thread/with spaces',
      {
        message: '继续',
        execution: {
          model: null,
          reasoning_effort: null,
          sandbox_mode: CodexSandboxMode.WorkspaceWrite,
          approval_policy: CodexApprovalPolicy.Untrusted,
        },
      },
      'idem-1',
    )

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/codex/hosts/host-1/threads/thread%2Fwith%20spaces/turns',
    )
    const options = fetchMock.mock.calls[0]?.[1] as {
      body: { message: string; execution: unknown }
      headers: Headers
    }
    expect(options.body).toEqual({
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

    await client.steer(
      'host-1',
      'thread-1',
      {
        message: '补充',
        execution: {
          model: null,
          reasoning_effort: null,
          sandbox_mode: CodexSandboxMode.WorkspaceWrite,
          approval_policy: CodexApprovalPolicy.Untrusted,
        },
      },
      'idem-2',
    )
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
