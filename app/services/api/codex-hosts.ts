import type {
  CodexHost,
  CodexHostCollection,
  CodexHostRenameRequest,
  CodexHostRevokeRequest,
} from '~/types/codex-host'
import { createCodexApiClient } from './codex-api-client'

interface ActiveHostState {
  active_host_id: string | null
  draining_host_id: string | null
  target_host_id: string | null
  drain_until: string | null
  version: number
}

export const CODEX_HOSTS_PATH = '/codex/hosts'
export const buildCodexHostPath = (hostId: string): string =>
  `${CODEX_HOSTS_PATH}/${encodeURIComponent(hostId)}`

export const createCodexHostsClient = () => {
  const client = createCodexApiClient()
  return {
    activate: async (hostId: string, signal?: AbortSignal): Promise<void> => {
      signal?.throwIfAborted()
      const current = await client.get<ActiveHostState>('/codex/active-host', {
        signal,
      })
      if (current.active_host_id === hostId) return
      let state =
        current.target_host_id === hostId
          ? current
          : await client.put<ActiveHostState>(
              '/codex/active-host',
              { host_id: hostId, expected_version: current.version },
              { signal },
            )
      // 保留原来的请求恢复预算，但从服务端收尾期限之后计时。
      // 许可窗口与页面等待不能同在 60 秒结束，否则最后一次状态推进会被页面抢先取消。
      const deadline =
        Math.max(
          Date.now(),
          state.drain_until === null ? 0 : Date.parse(state.drain_until),
        ) + 60_000
      while (state.active_host_id !== hostId) {
        if (state.target_host_id !== hostId)
          throw new Error('另一个窗口已切换电脑，请刷新。')
        if (Date.now() >= deadline)
          throw new Error(
            '电脑切换结果暂时无法确认，请恢复连接后重试；服务端会继续处理收尾。',
          )
        await new Promise<void>((resolve, reject) => {
          const abort = () => {
            clearTimeout(timer)
            reject(signal?.reason)
          }
          const timer = setTimeout(() => {
            signal?.removeEventListener('abort', abort)
            resolve()
          }, 750)
          signal?.addEventListener('abort', abort, { once: true })
          if (signal?.aborted) abort()
        })
        signal?.throwIfAborted()
        state = await client.get<ActiveHostState>('/codex/active-host', {
          signal,
        })
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
