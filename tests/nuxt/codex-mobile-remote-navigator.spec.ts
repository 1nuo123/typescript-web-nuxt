import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CodexMobileRemoteNavigator from '~/components/codex/CodexMobileRemoteNavigator.vue'
import { AuthScope, AuthSessionStatus } from '~/types/auth'

interface MockMobileRemoteRoute {
  query: Record<string, string>
}

const routeState = vi.hoisted(() => ({
  value: null as unknown as MockMobileRemoteRoute,
}))

mockNuxtImport('useRoute', () => () => routeState.value)

const envelope = <T>(data: T) => ({
  header: {
    code: 'system.success.ok',
    message: 'ok',
    request_id: 'request-1',
  },
  data,
})

const firstHost = {
  host_id: 'host-1',
  owner_subject_id: 'subject-1',
  display_name: 'First host',
  platform: 'windows',
  agent_version: '0.1.15',
  codex_version: '0.145.0',
  agent_protocol_version: '2.0',
  app_server_schema_digest: 'digest',
  status: 'online',
  capabilities: {
    items: [],
    model_ids: ['gpt-5'],
    reasoning_efforts: ['high'],
    sandbox_modes: ['workspace-write'],
    approval_policies: ['untrusted'],
  },
  compatibility: { state: 'compatible', reason_code: null },
  update: {
    state: 'current',
    channel: 'stable',
    current_version: '0.1.15',
    target_version: null,
    last_checked_at: '2026-08-21T00:00:00Z',
    last_result: null,
    security_deadline: null,
  },
  doctor: {
    state: 'healthy',
    checked_at: '2026-08-21T00:00:00Z',
    issue_codes: [],
  },
  last_seen_at: '2026-08-21T00:00:00Z',
  revoked_at: null,
  created_at: '2026-08-21T00:00:00Z',
  updated_at: '2026-08-21T00:00:00Z',
  version: 1,
}

const routedHost = {
  ...firstHost,
  host_id: 'host-2',
  display_name: 'Routed host',
}

const routedWorkspace = {
  workspace_id: 'workspace-2',
  host_id: 'host-2',
  owner_subject_id: 'subject-1',
  agent_workspace_key: 'routed-workspace',
  display_name: 'Routed workspace',
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
  created_at: '2026-08-21T00:00:00Z',
  updated_at: '2026-08-21T00:00:00Z',
  version: 1,
}

const applyOperatingSession = (): void => {
  const authStore = useAuthStore()
  authStore.status = AuthSessionStatus.Authenticated
  authStore.accessToken = 'access-token'
  authStore.principal = {
    kind: 'authenticated_principal',
    subject_id: 'subject-1',
    username: 'codex-user',
    roles: [],
    scopes: [
      AuthScope.CodexRead,
      AuthScope.CodexOperate,
      AuthScope.CodexFiles,
      AuthScope.CodexTerminal,
    ],
    is_admin: false,
  }
}

describe('Codex mobile Remote navigator', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore().$reset()
    useCodexApprovalsStore().$reset()
    useCodexSessionStore().$reset()
  })

  it('restores URL-selected host and workspace before enabling conversation creation', async () => {
    routeState.value = reactive({
      query: {
        hostId: routedHost.host_id,
        workspaceId: routedWorkspace.workspace_id,
      },
    })
    const fetchMock = vi.fn((url: string) => {
      if (url === '/codex/hosts')
        return envelope({ items: [firstHost, routedHost] })
      if (url === '/codex/hosts/host-2/workspaces') {
        return envelope({ items: [routedWorkspace] })
      }
      if (url === '/codex/hosts/host-2/threads') {
        return envelope({ items: [], next_cursor: null })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('$fetch', fetchMock)
    applyOperatingSession()

    const component = await mountSuspended(CodexMobileRemoteNavigator)
    await flushPromises()

    const sessionStore = useCodexSessionStore()
    expect(sessionStore.selectedHostId).toBe(routedHost.host_id)
    expect(sessionStore.selectedWorkspaceId).toBe(routedWorkspace.workspace_id)
    expect(
      component.get('button[title]').attributes('disabled'),
    ).toBeUndefined()
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/codex/hosts',
      '/codex/hosts/host-2/workspaces',
      '/codex/hosts/host-2/threads',
    ])
    component.unmount()
  })
})
