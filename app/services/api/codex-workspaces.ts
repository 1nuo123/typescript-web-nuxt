import type {
  CodexWorkspaceCollection,
  CodexWorkspace,
  CodexWorkspaceExecutionPreferencesResult,
  CodexWorkspaceExecutionPreferencesUpdate,
  CodexWorkspaceUpdateRequest,
} from '~/types/codex-workspace'
import { createCodexApiClient, createCodexIdempotencyKey, buildCodexIdempotencyHeaders } from './codex-api-client'
import type { CodexOperationAccepted } from '~/types/codex-turn'
import { waitForCodexOperation } from './codex-operations'

export const buildCodexWorkspacesPath = (hostId: string): string =>
  `/codex/hosts/${encodeURIComponent(hostId)}/workspaces`

export const buildCodexWorkspacePath = (
  hostId: string,
  workspaceId: string,
): string =>
  `${buildCodexWorkspacesPath(hostId)}/${encodeURIComponent(workspaceId)}`

/** 执行偏好独立于工作区元数据更新，避免设置面板改变会话主视图高度。 */
export const buildCodexWorkspacePreferencesPath = (
  hostId: string,
  workspaceId: string,
): string => `${buildCodexWorkspacePath(hostId, workspaceId)}/preferences`

export const createCodexWorkspacesClient = () => {
  const client = createCodexApiClient()
  return {
    list: (hostId: string) =>
      client.get<CodexWorkspaceCollection>(buildCodexWorkspacesPath(hostId)),
    update: (
      hostId: string,
      workspaceId: string,
      body: CodexWorkspaceUpdateRequest,
    ) =>
      client.patch<CodexWorkspace>(
        buildCodexWorkspacePath(hostId, workspaceId),
        body,
      ),
    readExecutionPreferences: (hostId: string, workspaceId: string) =>
      client.get<CodexWorkspaceExecutionPreferencesResult>(
        buildCodexWorkspacePreferencesPath(hostId, workspaceId),
      ),
    updateExecutionPreferences: async (
      hostId: string,
      workspaceId: string,
      body: CodexWorkspaceExecutionPreferencesUpdate,
    ): Promise<CodexWorkspaceExecutionPreferencesResult> => {
      const path = buildCodexWorkspacePreferencesPath(hostId, workspaceId)
      const accepted = await client.put<CodexOperationAccepted>(path, body, {
        headers: buildCodexIdempotencyHeaders(createCodexIdempotencyKey()),
      })
      await waitForCodexOperation(hostId, accepted)
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const result = await client.get<CodexWorkspaceExecutionPreferencesResult>(path)
        const actual = result.effective_preferences.requested
        if (actual.model === body.requested.model && actual.reasoning_effort === body.requested.reasoning_effort && actual.permission_mode === body.requested.permission_mode && result.effective_preferences.local_revision >= body.expected_revision) return result
        if (result.effective_preferences.local_revision > body.expected_revision) throw new Error('本机设置已被另一窗口修改，请重新读取后确认。')
        await new Promise(resolve => setTimeout(resolve, 250))
      }
      throw new Error('本机已保存，网页投影尚未同步，请重新读取确认。')
    },
  }
}
