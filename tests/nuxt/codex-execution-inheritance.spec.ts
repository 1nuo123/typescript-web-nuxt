import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CodexExecutionSettingsPage from '~/pages/codex/settings/execution.vue'
import { CodexApprovalPolicy, CodexSandboxMode } from '~/types/codex-host'
import type {
  CodexWorkspaceExecutionPreferencesResult,
  CodexWorkspaceExecutionPreferencesUpdate,
} from '~/types/codex-workspace'

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  update: vi.fn(),
  restore: vi.fn(),
  catalog: {
    state: 'ready',
    models: [
      {
        model: 'catalog-default',
        display_name: 'Catalog default',
        is_default: true,
        reasoning_efforts: ['low', 'medium'],
      },
      {
        model: 'project-model',
        display_name: 'Project model',
        is_default: false,
        reasoning_efforts: ['high', 'xhigh'],
      },
    ],
  },
}))

mockNuxtImport('useRoute', () => () => ({
  query: { hostId: 'host-1', workspaceId: 'workspace-1' },
}))
mockNuxtImport('createCodexWorkspacesClient', () => () => ({
  readExecutionPreferences: mocks.read,
}))
mockNuxtImport('useCodexSessionStore', () => () => ({
  projection: {
    hostsById: {
      'host-1': {
        display_name: 'ThinkPad',
        capabilities: { model_catalog: mocks.catalog },
      },
    },
    workspacesById: { 'workspace-1': { display_name: 'Isolated project' } },
  },
  restoreRouteSelection: mocks.restore,
  updateWorkspaceExecutionPreferences: mocks.update,
}))

function preferences(
  model: string,
  requestedEffort: string | null = null,
): CodexWorkspaceExecutionPreferencesResult {
  return {
    workspace_id: 'workspace-1',
    effective_preferences: {
      model,
      reasoning_effort: 'high',
      sandbox_mode: CodexSandboxMode.WorkspaceWrite,
      approval_policy: CodexApprovalPolicy.Untrusted,
      capabilities_revision: 'a'.repeat(64),
      requested: {
        model: null,
        reasoning_effort: requestedEffort,
        permission_mode: 'inherit',
      },
      local_revision: 3,
      applied_state: 'saved',
      error: null,
    },
    adjusted_fields: [],
  }
}

describe('Codex inherited project model settings', () => {
  beforeEach(() => {
    mocks.read.mockReset()
    mocks.update.mockReset()
    mocks.restore.mockResolvedValue(true)
  })

  it('offers the actual inherited nondefault model efforts and saves that selection', async () => {
    const result = preferences('project-model')
    mocks.read.mockResolvedValue(result)
    mocks.update.mockImplementation(
      (update: CodexWorkspaceExecutionPreferencesUpdate) => ({
        ...result,
        effective_preferences: {
          ...result.effective_preferences,
          ...update,
          reasoning_effort: update.requested.reasoning_effort,
        },
      }),
    )
    const page = await mountSuspended(CodexExecutionSettingsPage)
    try {
      await flushPromises()
      const effort = page.findAll('select')[1]!
      expect(
        effort.findAll('option').map((option) => option.attributes('value')),
      ).toEqual(['', 'high', 'xhigh'])
      await effort.setValue('xhigh')
      await page.findAll('select')[2]!.setValue('restricted')
      await page.get('button').trigger('click')
      await flushPromises()
      expect(mocks.update).toHaveBeenCalledWith(
        {
          expected_revision: 3,
          requested: {
            model: null,
            reasoning_effort: 'xhigh',
            permission_mode: 'restricted',
          },
        },
        { hostId: 'host-1', workspaceId: 'workspace-1' },
      )
      expect(page.text()).toContain('运行设置已由本机确认')
    } finally {
      page.unmount()
    }
  })

  it.each([null, 'high'])(
    'does not invent efforts for an inherited custom model (existing effort: %s)',
    async (existingEffort) => {
      const result = preferences('custom-local-model', existingEffort)
      mocks.read.mockResolvedValue(result)
      mocks.update.mockResolvedValue(result)
      const page = await mountSuspended(CodexExecutionSettingsPage)
      try {
        await flushPromises()
        const effort = page.findAll('select')[1]!
        expect(
          effort.findAll('option').map((option) => option.attributes('value')),
        ).toEqual(existingEffort ? ['', existingEffort] : [''])
        if (existingEffort)
          expect(effort.text()).toContain('high（本机已确认）')
        expect(page.text()).not.toContain('模型设置不可用')
        await page.findAll('select')[2]!.setValue('restricted')
        await page.get('button').trigger('click')
        await flushPromises()
        expect(mocks.update).toHaveBeenCalledWith(
          {
            expected_revision: 3,
            requested: {
              model: null,
              reasoning_effort: existingEffort,
              permission_mode: 'restricted',
            },
          },
          { hostId: 'host-1', workspaceId: 'workspace-1' },
        )
        expect(page.text()).toContain('运行设置已由本机确认')
      } finally {
        page.unmount()
      }
    },
  )
})
