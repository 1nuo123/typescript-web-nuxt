import type {
  CodexHost,
  CodexHostCollection,
  CodexHostRenameRequest,
  CodexHostRevokeRequest,
} from '~/types/codex-host'
import { createCodexApiClient } from './codex-api-client'

export const CODEX_HOSTS_PATH = '/codex/hosts'
export const buildCodexHostPath = (hostId: string): string =>
  `${CODEX_HOSTS_PATH}/${encodeURIComponent(hostId)}`

export const createCodexHostsClient = () => {
  const client = createCodexApiClient()
  return {
    list: () => client.get<CodexHostCollection>(CODEX_HOSTS_PATH),
    rename: (hostId: string, version: number, body: CodexHostRenameRequest) =>
      client.patch<CodexHost>(buildCodexHostPath(hostId), body, {
        headers: { 'If-Match': String(version) },
      }),
    revoke: (hostId: string, version: number, body: CodexHostRevokeRequest) =>
      client.post<CodexHost>(`${buildCodexHostPath(hostId)}/revoke`, body, {
        headers: { 'If-Match': String(version) },
      }),
  }
}
