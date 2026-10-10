import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CodexConversationHeader from '~/components/codex/CodexConversationHeader.vue'
import CodexExecutionSettingsPage from '~/pages/codex/settings/execution.vue'
import type { CodexWorkspaceExecutionPreferencesResult } from '~/types/codex-workspace'
import { CodexApprovalPolicy, CodexSandboxMode } from '~/types/codex-host'

interface MockSettingsRoute {
  query: Record<string, string>
}

const routeState = vi.hoisted(() => ({
  value: null as unknown as MockSettingsRoute,
}))

mockNuxtImport('useRoute', () => () => routeState.value)

const REVALIDATED_PREFERENCES: CodexWorkspaceExecutionPreferencesResult = {
  workspace_id: 'workspace-1',
  effective_preferences: {
    model: null,
    reasoning_effort: null,
    sandbox_mode: CodexSandboxMode.WorkspaceWrite,
    approval_policy: CodexApprovalPolicy.Untrusted,
    capabilities_revision: 'a'.repeat(64),
    requested: { model: null, reasoning_effort: null, permission_mode: 'inherit' },
    local_revision: 0,
    applied_state: 'saved',
    error: null,
  },
  adjusted_fields: ['model', 'sandbox_mode', 'capabilities_revision'],
}

describe('Codex execution settings', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    useCodexSessionStore().$reset()
    useAuthStore().$reset()
  })

  it('shows the server revalidation result without exposing an editable capability revision', async () => {
    routeState.value = reactive({
      query: { hostId: 'host-1', workspaceId: 'workspace-1' },
    })
    const sessionStore = useCodexSessionStore()
    vi.spyOn(sessionStore, 'restoreRouteSelection').mockResolvedValue(true)
    vi.spyOn(
      sessionStore,
      'loadWorkspaceExecutionPreferences',
    ).mockResolvedValue(REVALIDATED_PREFERENCES)

    const component = await mountSuspended(CodexExecutionSettingsPage)
    await flushPromises()

    expect(component.text()).toContain('设置已按当前权限调整')
    expect(component.text()).toContain('模型、沙箱、主机能力版本')
    expect(component.find('input[value="a"]').exists()).toBe(false)
    expect(component.text()).not.toContain('capabilities_revision')
    component.unmount()
  })

  it('opens the full-screen execution settings route from the conversation toolbar', async () => {
    const sessionStore = useCodexSessionStore()
    sessionStore.selectedHostId = 'host-1'
    sessionStore.selectedWorkspaceId = 'workspace-1'

    const component = await mountSuspended(CodexConversationHeader, {
      props: {
        activeTurn: false,
        interrupting: false,
        compacting: false,
        canCompact: false,
        canOperate: true,
      },
    })

    const settingsLink = component.get('[aria-label="运行设置"]')
    expect(settingsLink.attributes('href')).toBe(
      '/codex/settings/execution?hostId=host-1&workspaceId=workspace-1',
    )
    component.unmount()
  })
})
