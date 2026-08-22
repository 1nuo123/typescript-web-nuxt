import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { API_AUTHORIZATION_HEADER_NAME } from '~/types/api'
import TasksPage from '~/pages/codex/tasks/index.vue'
import CodexSettingsPage from '~/pages/codex/settings/index.vue'
import VerifyDevicePage from '~/pages/codex/verify-device.vue'
import CodexComposer from '~/components/codex/CodexComposer.vue'
import CodexMobilePageHeader from '~/components/codex/CodexMobilePageHeader.vue'
import CodexMobileRemoteNavigator from '~/components/codex/CodexMobileRemoteNavigator.vue'
import {
  AUTH_BEARER_TOKEN_TYPE,
  AUTH_STEP_UP_PATH,
  AuthScope,
  AuthSessionStatus,
} from '~/types/auth'
import { CodexDeviceErrorCode } from '~/types/codex-device'
import { WorkspaceSelectionState } from '~/types/codex-workspace'
import {
  buildCodexProjectRoute,
  buildCodexApprovalsRoute,
  buildCodexTaskRoute,
  buildCodexTasksRoute,
} from '~/types/routes'

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
  execution_preferences: {
    model: null,
    reasoning_effort: null,
    sandbox_mode: 'workspace-write',
    approval_policy: 'untrusted',
    capabilities_revision: 'a'.repeat(64),
  },
  enabled: true,
  is_pinned: false,
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
  title_source: 'app_server',
  model: 'gpt-5',
  model_provider: 'openai',
  reasoning_effort: 'high',
  status: 'idle',
  active_turn_id: null,
  archived: false,
  is_pinned: false,
  source_kind: 'app_server',
  created_at: '2026-08-01T00:00:00Z',
  recency_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  last_synced_at: '2026-08-01T00:00:00Z',
}

const applyCodexSession = (scopes: AuthScope[]): void => {
  const authStore = useAuthStore()
  authStore.status = AuthSessionStatus.Authenticated
  authStore.accessToken = 'access-token'
  authStore.principal = {
    kind: 'authenticated_principal',
    subject_id: 'subject-1',
    username: 'codex-user',
    roles: [],
    scopes,
    is_admin: false,
  }
}

describe('Codex pages and mobile controls', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore().$reset()
    useCodexDevicesStore().$reset()
    useCodexSessionStore().$reset()
    useCodexUiStore().$reset()
  })

  it('loads host, workspace and thread selections without creating a conversation', async () => {
    const fetchMock = vi.fn((url: string, _options?: { method?: string }) => {
      if (url === '/codex/hosts') return envelope({ items: [host] })
      if (url.endsWith('/workspaces')) return envelope({ items: [workspace] })
      if (url.endsWith('/threads'))
        return envelope({ items: [thread], next_cursor: null })
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('$fetch', fetchMock)
    applyCodexSession([AuthScope.CodexRead])

    const component = await mountSuspended(TasksPage)
    await flushPromises()

    expect(component.text()).toContain('FastAPI Backend')
    expect(component.text()).toContain('main')
    expect(component.text()).toContain('活动会话')
    expect(component.text()).not.toContain('最近任务')
    expect(component.text()).not.toContain('未命名任务')
    expect(component.text()).not.toContain('默认模型')
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/codex/hosts',
      '/codex/hosts/host-1/workspaces',
      '/codex/hosts/host-1/threads',
    ])
    expect(
      fetchMock.mock.calls.some(
        ([url, options]) =>
          String(url).endsWith('/threads') &&
          (options as { method?: string } | undefined)?.method === 'POST',
      ),
    ).toBe(false)
    component.unmount()
  })

  it('restores the explicit host and workspace without selecting the first project', async () => {
    const secondHost = { ...host, host_id: 'host-2', display_name: 'Desktop' }
    const secondWorkspace = {
      ...workspace,
      workspace_id: 'workspace-2',
      host_id: 'host-2',
      display_name: 'Test Project',
    }
    const fetchMock = vi.fn((url: string) => {
      if (url === '/codex/hosts') return envelope({ items: [host, secondHost] })
      if (url === '/codex/hosts/host-1/workspaces')
        return envelope({ items: [workspace] })
      if (url === '/codex/hosts/host-2/workspaces')
        return envelope({ items: [secondWorkspace] })
      if (url.endsWith('/threads'))
        return envelope({ items: [], next_cursor: null })
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('$fetch', fetchMock)

    const store = useCodexSessionStore()
    const restored = await store.restoreRouteSelection({
      hostId: 'host-2',
      workspaceId: 'workspace-2',
    })

    expect(restored).toBe(true)
    expect(store.selectedHostId).toBe('host-2')
    expect(store.selectedWorkspaceId).toBe('workspace-2')
    expect(store.workspaceSelectionState).toBe(WorkspaceSelectionState.Resolved)
  })

  it('rejects an invalid routed workspace instead of falling back to another project', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === '/codex/hosts') return envelope({ items: [host] })
      if (url.endsWith('/workspaces')) return envelope({ items: [workspace] })
      if (url.endsWith('/threads'))
        return envelope({ items: [], next_cursor: null })
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('$fetch', fetchMock)

    const store = useCodexSessionStore()
    const restored = await store.restoreRouteSelection({
      hostId: 'host-1',
      workspaceId: 'revoked-workspace',
    })

    expect(restored).toBe(false)
    expect(store.selectedWorkspaceId).toBeNull()
    expect(store.workspaceSelectionState).toBe(WorkspaceSelectionState.Missing)
    expect(store.selectionError).toContain('不可见')
  })

  it('requires an explicit host for a routed workspace', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === '/codex/hosts') return envelope({ items: [host] })
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('$fetch', fetchMock)

    const store = useCodexSessionStore()
    const restored = await store.restoreRouteSelection({
      workspaceId: 'workspace-1',
    })

    expect(restored).toBe(false)
    expect(store.selectedWorkspaceId).toBeNull()
    expect(store.selectionError).toContain('缺少可验证的主机定位信息')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uses thread authority and rejects a mismatched workspace route', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === '/codex/hosts') return envelope({ items: [host] })
      if (url.endsWith('/workspaces')) return envelope({ items: [workspace] })
      if (url.endsWith('/threads'))
        return envelope({ items: [thread], next_cursor: null })
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('$fetch', fetchMock)

    const store = useCodexSessionStore()
    const restored = await store.restoreRouteSelection({
      hostId: 'host-1',
      workspaceId: 'other-workspace',
      threadId: 'thread-1',
    })

    expect(restored).toBe(false)
    expect(store.selectedWorkspaceId).toBeNull()
    expect(store.selectedThreadId).toBeNull()
    expect(store.selectionError).toContain('不匹配')
  })

  it('builds task routes with authoritative host and workspace identifiers', () => {
    expect(
      buildCodexTaskRoute('thread-1', {
        hostId: 'host-1',
        workspaceId: 'workspace-1',
      }),
    ).toBe('/codex/tasks/thread-1?hostId=host-1&workspaceId=workspace-1')
    expect(
      buildCodexTasksRoute({
        hostId: 'host-1',
        workspaceId: 'workspace-1',
      }),
    ).toBe('/codex/tasks?hostId=host-1&workspaceId=workspace-1')
    expect(buildCodexProjectRoute('workspace-1', { hostId: 'host-1' })).toBe(
      '/codex/projects/workspace-1?hostId=host-1',
    )
    expect(
      buildCodexTaskRoute('thread-1', {
        hostId: 'host-1',
        workspaceId: 'workspace-1',
        searchTerm: '会话 标题',
        archived: true,
      }),
    ).toBe(
      '/codex/tasks/thread-1?hostId=host-1&workspaceId=workspace-1&search=%E4%BC%9A%E8%AF%9D+%E6%A0%87%E9%A2%98&archived=true',
    )
    expect(
      buildCodexTasksRoute({
        hostId: 'host-1',
        workspaceId: 'workspace-1',
        searchTerm: '会话 标题',
        archived: true,
      }),
    ).toBe(
      '/codex/tasks?hostId=host-1&workspaceId=workspace-1&search=%E4%BC%9A%E8%AF%9D+%E6%A0%87%E9%A2%98&archived=true',
    )
    expect(
      buildCodexApprovalsRoute({
        threadId: 'thread-1',
        returnTo:
          '/codex/tasks/thread-1?hostId=host-1&timelineAnchorItem=item-3&timelineAnchorOffset=-18',
      }),
    ).toBe(
      '/codex/approval-center?threadId=thread-1&returnTo=%2Fcodex%2Ftasks%2Fthread-1%3FhostId%3Dhost-1%26timelineAnchorItem%3Ditem-3%26timelineAnchorOffset%3D-18',
    )
    expect(
      buildCodexApprovalsRoute({
        returnTo: 'https://untrusted.example/redirect',
      }),
    ).toBe('/codex/approval-center')
  })

  it('shows an online Agent as connected and keeps reinstall as a secondary action', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === '/codex/hosts') return envelope({ items: [host] })
      if (url === '/codex/agent-release/current')
        return envelope({
          header: {
            kind: 'codex_agent_release_manifest',
            schema_version: '1.0',
            channel: 'stable',
          },
          detail: {
            version: '0.1.3',
            distribution_mode: 'verified',
            artifact_sha256:
              'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            download_url: 'https://downloads.acme.dev/CodexRemoteAgent.msi',
            manifest_url: 'https://downloads.acme.dev/metadata/timestamp.json',
            minimum_security_version: '0.1.3',
            automatic_updates_enabled: true,
          },
        })
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('$fetch', fetchMock)
    applyCodexSession([AuthScope.CodexHostManage])

    const component = await mountSuspended(VerifyDevicePage)
    await flushPromises()

    expect(component.text()).toContain('Agent 已连接')
    expect(component.text()).toContain('ThinkPad · Agent 1.0.0')
    expect(component.text()).toContain('进入 Remote')
    expect(component.text()).toContain('重新下载安装包')
    expect(component.text()).not.toContain('下载签名 Agent')
    component.unmount()
  })

  it('requires acknowledgement before offering an internal Agent download', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === '/codex/hosts') return envelope({ items: [host] })
      if (url === '/codex/agent-release/current')
        return envelope({
          header: {
            kind: 'codex_agent_release_manifest',
            schema_version: '1.0',
            channel: 'stable',
          },
          detail: {
            version: '0.1.16',
            distribution_mode: 'internal',
            artifact_sha256:
              'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            download_url:
              'https://downloads.acme.dev/releases/download/v0.1.16/CodexRemoteAgent.msi',
            manifest_url:
              'https://downloads.acme.dev/releases/download/v0.1.16/internal-release.json',
            minimum_security_version: '0.1.16',
            automatic_updates_enabled: false,
          },
        })
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('$fetch', fetchMock)
    applyCodexSession([AuthScope.CodexHostManage])

    const component = await mountSuspended(VerifyDevicePage)
    await flushPromises()

    expect(component.text()).toContain('内部体验安装包')
    expect(component.text()).toContain('未完成正式代码签名和自动更新发布')
    expect(component.text()).toContain(
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    )
    const downloadButton = component
      .findAll('button')
      .find((button) => button.text().includes('重新下载安装包'))
    expect(downloadButton?.attributes('disabled')).toBeDefined()

    await component
      .get('input[aria-label="已了解内部体验包风险"]')
      .setValue(true)

    expect(downloadButton?.attributes('disabled')).toBeUndefined()
    component.unmount()
  })

  it('groups mobile Remote conversations by project without duplicate task navigation', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === '/codex/hosts') return envelope({ items: [host] })
      if (url.endsWith('/workspaces')) return envelope({ items: [workspace] })
      if (url.endsWith('/threads'))
        return envelope({ items: [thread], next_cursor: null })
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('$fetch', fetchMock)
    applyCodexSession([AuthScope.CodexRead])

    const component = await mountSuspended(CodexMobileRemoteNavigator)
    await flushPromises()

    expect(component.text()).toContain('Remote')
    expect(component.text()).toContain('ThinkPad')
    expect(component.text()).toContain('FastAPI Backend')
    expect(component.text()).toContain('完成 Phase 3')
    expect(component.text()).not.toContain('最近任务')
    expect(component.text()).not.toContain('未命名任务')
    component.unmount()
  })

  it('builds an explicit Remote return link for mobile secondary pages', async () => {
    const sessionStore = useCodexSessionStore()
    sessionStore.projection.hostsById[host.host_id] = host as never
    sessionStore.projection.workspacesById[workspace.workspace_id] =
      workspace as never
    sessionStore.projection.threadsById[thread.upstream_thread_id] =
      thread as never
    sessionStore.selectedHostId = host.host_id
    sessionStore.selectedWorkspaceId = workspace.workspace_id
    sessionStore.selectedThreadId = thread.upstream_thread_id

    const component = await mountSuspended(CodexMobilePageHeader, {
      props: { title: '审批中心' },
    })

    expect(component.text()).toContain('Remote')
    expect(component.text()).toContain('审批中心')
    expect(component.get('[aria-label="返回 Remote"]').attributes('href')).toBe(
      '/codex/tasks/thread-1?hostId=host-1&workspaceId=workspace-1',
    )
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

  it('refreshes a conflicted host version without losing input or retrying automatically', async () => {
    const refreshedHost = { ...host, version: 2 }
    const renamedHost = {
      ...refreshedHost,
      display_name: '开发电脑',
      version: 3,
    }
    const submittedVersions: string[] = []
    let hostListRequestCount = 0
    let renameRequestCount = 0
    const fetchMock = vi.fn(
      (url: string, options?: { method?: string; headers?: HeadersInit }) => {
        if (url === '/codex/hosts' && options?.method === 'GET') {
          hostListRequestCount += 1
          return envelope({
            items: [hostListRequestCount === 1 ? host : refreshedHost],
          })
        }
        if (url === '/codex/hosts/host-1' && options?.method === 'PATCH') {
          renameRequestCount += 1
          submittedVersions.push(
            new Headers(options.headers).get('If-Match') ?? '',
          )
          if (renameRequestCount === 1) {
            throw {
              statusCode: 412,
              data: {
                header: {
                  code: CodexDeviceErrorCode.VersionConflict,
                  message: 'Codex主机版本已经变化。',
                  request_id: 'request-host-conflict',
                },
                data: {
                  kind: 'http_fault',
                  schema_version: '1.0',
                  status_code: 412,
                  error_code: CodexDeviceErrorCode.VersionConflict,
                },
              },
            }
          }
          return envelope(renamedHost)
        }
        throw new Error(`Unexpected URL: ${url}`)
      },
    )
    vi.stubGlobal('$fetch', fetchMock)
    applyCodexSession([AuthScope.CodexHostManage])

    const component = await mountSuspended(CodexSettingsPage, {
      global: {
        stubs: {
          teleport: true,
        },
      },
    })
    await flushPromises()
    await component.get('[aria-label="重命名电脑"]').trigger('click')
    const input = component.get('input')
    await input.setValue('开发电脑')
    await component.get('form').trigger('submit')
    await flushPromises()

    expect(renameRequestCount).toBe(1)
    expect(hostListRequestCount).toBe(2)
    expect(component.text()).toContain('Codex主机版本已经变化。')
    expect(component.get('input').element.value).toBe('开发电脑')
    expect(useCodexDevicesStore().hosts[0]?.version).toBe(2)

    await component.get('form').trigger('submit')
    await flushPromises()

    expect(renameRequestCount).toBe(2)
    expect(submittedVersions).toEqual(['1', '2'])
    expect(useCodexDevicesStore().hosts[0]?.display_name).toBe('开发电脑')
    expect(component.find('[role="dialog"]').exists()).toBe(false)
    component.unmount()
  })

  it('removes a revoked host and every related session projection immediately', async () => {
    const grantToken = 'g'.repeat(64)
    const fetchMock = vi.fn((url: string) => {
      if (url === AUTH_STEP_UP_PATH) {
        return envelope({
          grant_token: grantToken,
          expires_at: '2026-08-14T12:00:00Z',
        })
      }
      if (url === '/codex/hosts/host-1/revoke') {
        return envelope({
          ...host,
          status: 'revoked',
          revoked_at: '2026-08-14T11:00:00Z',
          version: 2,
        })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('$fetch', fetchMock)
    applyCodexSession([AuthScope.CodexHostManage])
    const devicesStore = useCodexDevicesStore()
    devicesStore.hosts = [host as never]
    const sessionStore = useCodexSessionStore()
    sessionStore.projection.hostsById[host.host_id] = host as never
    sessionStore.projection.workspacesById[workspace.workspace_id] =
      workspace as never
    sessionStore.projection.threadsById[thread.upstream_thread_id] =
      thread as never
    sessionStore.selectedHostId = host.host_id
    sessionStore.selectedWorkspaceId = workspace.workspace_id
    sessionStore.selectedThreadId = thread.upstream_thread_id

    await devicesStore.revokeHost(host as never, 'password')

    expect(devicesStore.hosts).toEqual([])
    expect(sessionStore.projection.hostsById).toEqual({})
    expect(sessionStore.projection.workspacesById).toEqual({})
    expect(sessionStore.projection.threadsById).toEqual({})
    expect(sessionStore.selectedHostId).toBeNull()
    expect(sessionStore.selectedWorkspaceId).toBeNull()
    expect(sessionStore.selectedThreadId).toBeNull()
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

  it('uses the supplied realtime block reason while preserving a disabled draft', async () => {
    const component = await mountSuspended(CodexComposer, {
      props: {
        modelValue: '等待同步的草稿',
        disabled: true,
        disabledReason: '实时状态同步中，暂时不能发送消息。',
      },
    })

    expect(component.get('textarea').element.value).toBe('等待同步的草稿')
    expect(component.get('textarea').attributes('placeholder')).toContain(
      '实时状态同步中',
    )
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

  it('caps the mobile composer at 35 percent of the visual viewport', async () => {
    const visualViewport = new EventTarget()
    Object.defineProperties(visualViewport, {
      height: { configurable: true, value: 600 },
    })
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: visualViewport,
    })
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 390,
    })
    const component = await mountSuspended(CodexComposer, {
      props: { modelValue: '' },
    })
    const textarea = component.get('textarea')
    Object.defineProperty(textarea.element, 'scrollHeight', {
      configurable: true,
      get: () => 320,
    })

    await component.setProps({ modelValue: '长草稿'.repeat(100) })
    await nextTick()

    expect(textarea.attributes('style')).toContain('max-height: 210px')
    expect(textarea.attributes('style')).toContain('height: 210px')
    expect(textarea.attributes('style')).toContain('overflow-y: auto')
    component.unmount()
  })

  it('uses the desktop composer cap and releases visual viewport listeners', async () => {
    const visualViewport = new EventTarget()
    Object.defineProperties(visualViewport, {
      height: { configurable: true, value: 500 },
    })
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: visualViewport,
    })
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280,
    })
    const component = await mountSuspended(CodexComposer, {
      props: { modelValue: '' },
    })
    const textarea = component.get('textarea')
    Object.defineProperty(textarea.element, 'scrollHeight', {
      configurable: true,
      get: () => 360,
    })

    await component.setProps({ modelValue: '桌面长草稿'.repeat(100) })
    await nextTick()
    expect(textarea.attributes('style')).toContain('max-height: 240px')
    expect(textarea.attributes('style')).toContain('height: 240px')

    component.unmount()
    Object.defineProperty(visualViewport, 'height', {
      configurable: true,
      value: 300,
    })
    visualViewport.dispatchEvent(new Event('resize'))
    await nextTick()
    expect(textarea.attributes('style')).toContain('height: 240px')
  })
})
