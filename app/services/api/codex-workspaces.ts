import type {
  CodexWorkspaceCollection,
  CodexWorkspace,
  CodexWorkspaceExecutionPreferencesResult,
  CodexWorkspaceExecutionPreferencesUpdate,
  CodexWorkspaceUpdateRequest,
} from '~/types/codex-workspace'
import { createCodexApiClient } from './codex-api-client'

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
    updateExecutionPreferences: (
      hostId: string,
      workspaceId: string,
      body: CodexWorkspaceExecutionPreferencesUpdate,
    ) =>
      client.put<CodexWorkspaceExecutionPreferencesResult>(
        buildCodexWorkspacePreferencesPath(hostId, workspaceId),
        body,
      ),
  }
}
