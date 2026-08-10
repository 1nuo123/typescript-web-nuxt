import type {
  CodexWorkspaceCollection,
  CodexWorkspace,
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
  }
}
