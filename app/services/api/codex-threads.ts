import type {
  CodexThreadCollection,
  CodexThreadCreateRequest,
  CodexThreadAuthoritySnapshot,
} from '~/types/codex-thread'
import type {
  CodexOperationAccepted,
  CodexTurnMessageRequest,
} from '~/types/codex-turn'
import {
  buildCodexIdempotencyHeaders,
  createCodexApiClient,
  createCodexIdempotencyKey,
} from './codex-api-client'

export const buildCodexThreadsPath = (hostId: string): string =>
  `/codex/hosts/${encodeURIComponent(hostId)}/threads`

export const buildCodexThreadPath = (
  hostId: string,
  threadId: string,
): string => `${buildCodexThreadsPath(hostId)}/${encodeURIComponent(threadId)}`

const commandOptions = (idempotencyKey?: string) => ({
  headers: buildCodexIdempotencyHeaders(
    idempotencyKey ?? createCodexIdempotencyKey(),
  ),
})

export const createCodexThreadsClient = () => {
  const client = createCodexApiClient()
  return {
    list: (hostId: string) =>
      client.get<CodexThreadCollection>(buildCodexThreadsPath(hostId)),
    read: (
      hostId: string,
      threadId: string,
      historyCursor?: string | null,
      historyLimit = 100,
    ) =>
      client.get<CodexThreadAuthoritySnapshot>(
        buildCodexThreadPath(hostId, threadId),
        {
          query: {
            include_history: true,
            history_limit: historyLimit,
            ...(historyCursor ? { history_cursor: historyCursor } : {}),
          },
        },
      ),
    create: (
      hostId: string,
      body: CodexThreadCreateRequest,
      idempotencyKey?: string,
    ) =>
      client.post<CodexOperationAccepted>(
        buildCodexThreadsPath(hostId),
        body,
        commandOptions(idempotencyKey),
      ),
    resume: (hostId: string, threadId: string, idempotencyKey?: string) =>
      client.post<CodexOperationAccepted>(
        `${buildCodexThreadPath(hostId, threadId)}/resume`,
        undefined,
        commandOptions(idempotencyKey),
      ),
    startTurn: (
      hostId: string,
      threadId: string,
      body: CodexTurnMessageRequest,
      idempotencyKey?: string,
    ) =>
      client.post<CodexOperationAccepted>(
        `${buildCodexThreadPath(hostId, threadId)}/turns`,
        body,
        commandOptions(idempotencyKey),
      ),
    steer: (
      hostId: string,
      threadId: string,
      body: CodexTurnMessageRequest,
      idempotencyKey?: string,
    ) =>
      client.post<CodexOperationAccepted>(
        `${buildCodexThreadPath(hostId, threadId)}/steer`,
        body,
        commandOptions(idempotencyKey),
      ),
    interrupt: (hostId: string, threadId: string, idempotencyKey?: string) =>
      client.post<CodexOperationAccepted>(
        `${buildCodexThreadPath(hostId, threadId)}/interrupt`,
        undefined,
        commandOptions(idempotencyKey),
      ),
    compact: (hostId: string, threadId: string, idempotencyKey?: string) =>
      client.post<CodexOperationAccepted>(
        `${buildCodexThreadPath(hostId, threadId)}/compact`,
        undefined,
        commandOptions(idempotencyKey),
      ),
  }
}
