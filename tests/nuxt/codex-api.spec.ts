import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthSessionStatus } from '~/types/auth'
import { CodexApprovalPolicy, CodexSandboxMode } from '~/types/codex-host'
import { createCodexHostsClient } from '~/services/api/codex-hosts'
import { createCodexThreadsClient } from '~/services/api/codex-threads'

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
})
