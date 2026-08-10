import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { API_AUTHORIZATION_HEADER_NAME } from '~/types/api'
import TasksPage from '~/pages/codex/tasks/index.vue'
import CodexSettingsPage from '~/pages/codex/settings/index.vue'
import CodexComposer from '~/components/codex/CodexComposer.vue'
import {
  AUTH_BEARER_TOKEN_TYPE,
  AUTH_STEP_UP_PATH,
  AuthSessionStatus,
} from '~/types/auth'

const AUTH_CREDENTIALS_INVALID_ERROR_CODE = 'auth.credentials.invalid'

const envelope = <T>(data: T) => ({
  header: {
    code: 'system.success.ok',
    message: 'ok',
    request_id: 'request-1',
  },
  data,
})

const offlineFaultEnvelope = () => ({
  header: {
    code: 'codex.host.offline',
    message: 'Codex主机离线，operation可按原Idempotency-Key重试。',
    request_id: 'request-offline',
  },
  data: {
    kind: 'http_fault',
    schema_version: '1.0',
    status_code: 409,
    error_code: 'codex.host.offline',
  },
})

const host = {
  host_id: 'host-1',
  owner_subject_id: 'subject-1',
  display_name: 'ThinkPad',
  platform: 'windows',
  agent_version: '1.0.0',
  codex_version: '0.145.0',
  agent_protocol_version: '1.0',
  app_server_schema_digest: 'digest',
  status: 'online',
  capabilities: {
    items: [],
    model_ids: ['gpt-5'],
    reasoning_efforts: ['high'],
    sandbox_modes: ['workspace-write'],
    approval_policies: ['untrusted'],
  },
  compatibility: {
    state: 'compatible',
    reason_code: null,
  },
  update: {
    state: 'current',
    channel: 'stable',
    current_version: '1.0.0',
    target_version: null,
    last_checked_at: '2026-08-01T00:00:00Z',
    last_result: null,
    security_deadline: null,
  },
  doctor: {
    state: 'healthy',
    checked_at: '2026-08-01T00:00:00Z',
    issue_codes: [],
  },
  last_seen_at: '2026-08-01T00:00:00Z',
  revoked_at: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  version: 1,
}
const workspace = {
  workspace_id: 'workspace-1',
  host_id: 'host-1',
  owner_subject_id: 'subject-1',
  agent_workspace_key: 'fastapi-work',
  display_name: 'FastAPI Backend',
  repo_fingerprint: null,
  default_branch: 'main',
  enabled: true,
  worktree_policy: {
    enabled: false,
    retention: 'keep_until_workspace_removed',
    ttl_hours: null,
  },
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  version: 1,
}
const thread = {
  thread_index_id: 'thread-index-1',
  host_id: 'host-1',
  workspace_id: 'workspace-1',
  owner_subject_id: 'subject-1',
  upstream_thread_id: 'thread-1',
  display_name: '完成 Phase 3',
  model: 'gpt-5',
  reasoning_effort: 'high',
  status: 'idle',
  active_turn_id: null,
  archived: false,
  source_kind: 'app_server',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  last_synced_at: '2026-08-01T00:00:00Z',
}

describe('Codex pages and mobile controls', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore().$reset()
    useCodexDevicesStore().$reset()
    useCodexSessionStore().$reset()
    useCodexUiStore().$reset()
  })

  it('loads host, workspace and thread selections through their services', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === '/codex/hosts') return envelope({ items: [host] })
      if (url.endsWith('/workspaces')) return envelope({ items: [workspace] })
      if (url.endsWith('/threads')) return envelope({ items: [thread] })
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('$fetch', fetchMock)
    const authStore = useAuthStore()
    authStore.status = AuthSessionStatus.Authenticated
    authStore.accessToken = 'access-token'

    const component = await mountSuspended(TasksPage)
    await flushPromises()

    expect(component.text()).toContain('ThinkPad · 在线')
    expect(component.text()).toContain('FastAPI Backend · main')
    expect(component.text()).toContain('完成 Phase 3')
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/codex/hosts',
      '/codex/hosts/host-1/workspaces',
      '/codex/hosts/host-1/threads',
    ])
    component.unmount()
  })

  it('reuses the thread creation idempotency key while the host is offline', async () => {
    const idempotencyKeys: string[] = []
    const fetchMock = vi.fn((url: string, options?: { headers?: Headers }) => {
      if (!url.endsWith('/threads')) throw new Error(`Unexpected URL: ${url}`)
      idempotencyKeys.push(options?.headers?.get('Idempotency-Key') ?? '')
      return offlineFaultEnvelope()
    })
    vi.stubGlobal('$fetch', fetchMock)
    const sessionStore = useCodexSessionStore()
    sessionStore.selectedHostId = 'host-1'
    sessionStore.selectedWorkspaceId = 'workspace-1'

    await expect(sessionStore.createThread()).rejects.toMatchObject({
      errorCode: 'codex.host.offline',
    })
    await expect(sessionStore.createThread()).rejects.toMatchObject({
      errorCode: 'codex.host.offline',
    })

    expect(idempotencyKeys).toHaveLength(2)
    expect(idempotencyKeys[0]).toBeTruthy()
    expect(idempotencyKeys[1]).toBe(idempotencyKeys[0])
  })

  it('keeps a failed host revoke in the confirmation dialog for retry', async () => {
    const stepUpError = {
      statusCode: 401,
      data: {
        header: {
          code: AUTH_CREDENTIALS_INVALID_ERROR_CODE,
          message: '增强验证失败。',
          request_id: 'request-step-up-invalid',
        },
        data: {
          kind: 'http_fault',
          schema_version: '1.0',
          status_code: 401,
          error_code: AUTH_CREDENTIALS_INVALID_ERROR_CODE,
        },
      },
    }
    const fetchMock = vi.fn((url: string, _options?: { headers?: Headers }) => {
      if (url === '/codex/hosts') return envelope({ items: [host] })
      if (url === AUTH_STEP_UP_PATH) throw stepUpError
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('$fetch', fetchMock)
    const authStore = useAuthStore()
    authStore.status = AuthSessionStatus.Authenticated
    authStore.accessToken = 'access-token'

    const component = await mountSuspended(CodexSettingsPage, {
      global: {
        stubs: {
          teleport: true,
        },
      },
    })
    await flushPromises()
    await component.get('[aria-label="撤销电脑"]').trigger('click')
    await component.get('input[type="password"]').setValue('wrong-password')
    await component.get('form').trigger('submit')
    await flushPromises()

    expect(component.text()).toContain('增强验证失败。')
    expect(component.get('input[type="password"]').attributes('type')).toBe(
      'password',
    )
    const stepUpHeaders = new Headers(fetchMock.mock.calls[1]?.[1]?.headers)
    expect(stepUpHeaders.get(API_AUTHORIZATION_HEADER_NAME)).toBe(
      `${AUTH_BEARER_TOKEN_TYPE} access-token`,
    )
    component.unmount()
  })

  it('keeps mobile drafts visible while an offline host disables sending', async () => {
    const component = await mountSuspended(CodexComposer, {
      props: {
        modelValue: '保留这条草稿',
        disabled: true,
      },
    })

    const textarea = component.get('textarea')
    expect(textarea.attributes('disabled')).toBeDefined()
    expect(textarea.element.value).toBe('保留这条草稿')
    expect(textarea.attributes('placeholder')).toContain('主机离线')
    expect(component.get('button').attributes('disabled')).toBeDefined()
    component.unmount()
  })

  it('switches the composer action to steer while a turn is active', async () => {
    const component = await mountSuspended(CodexComposer, {
      props: {
        modelValue: '追加约束',
        activeTurn: true,
      },
    })

    expect(component.get('button').text()).toBe('追加指令')
    await component.get('form').trigger('submit')
    expect(component.emitted('submit')).toEqual([['追加约束']])
    component.unmount()
  })
})
