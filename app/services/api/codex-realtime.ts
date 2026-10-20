import type { CodexRealtimeTicket } from '~/types/codex-realtime'
import { createCodexApiClient } from './codex-api-client'

export const CODEX_REALTIME_TICKET_PATH = '/codex/realtime-tickets'

export const createCodexRealtimeClient = () => {
  const client = createCodexApiClient()
  return {
    issueTicket: (signal?: AbortSignal) =>
      client.post<CodexRealtimeTicket>(CODEX_REALTIME_TICKET_PATH, undefined, {
        signal,
      }),
  }
}
