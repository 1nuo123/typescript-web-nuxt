import type {
  CodexHost,
  CodexHostCollection,
  CodexHostRenameRequest,
  CodexHostRevokeRequest,
} from '~/types/codex-host'
import { createCodexApiClient } from './codex-api-client'

interface ActiveHostState { active_host_id: string | null; draining_host_id: string | null; target_host_id: string | null; version: number }

export const CODEX_HOSTS_PATH = '/codex/hosts'
export const buildCodexHostPath = (hostId: string): string =>
  `${CODEX_HOSTS_PATH}/${encodeURIComponent(hostId)}`

export const createCodexHostsClient = () => {
  const client = createCodexApiClient()
  return {
    activate: async (hostId: string): Promise<void> => {
      const current = await client.get<ActiveHostState>('/codex/active-host')
      if (current.active_host_id === hostId) return
      let state = current.target_host_id === hostId ? current : await client.put<ActiveHostState>('/codex/active-host', { host_id: hostId, expected_version: current.version })
      const deadline = Date.now() + 60_000
      while (state.active_host_id !== hostId) {
        if (state.target_host_id !== hostId) throw new Error('另一个窗口已切换电脑，请刷新。')
        if (Date.now() >= deadline) throw new Error('仍在等待旧电脑停止 Remote 执行，请稍后核对连接状态。')
        await new Promise(resolve => setTimeout(resolve, 750))
        state = await client.get<ActiveHostState>('/codex/active-host')
      }
    },
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
