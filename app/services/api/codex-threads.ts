import type {
  CodexConversationListQuery,
  CodexConversationPinRequest,
  CodexConversationRenameRequest,
  CodexThread,
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

const CODEX_DEFAULT_HISTORY_LIMIT = 100

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
    list: (hostId: string, query: CodexConversationListQuery = {}) =>
      client.get<CodexThreadCollection>(buildCodexThreadsPath(hostId), {
        query: {
          ...(query.workspace_id ? { workspace_id: query.workspace_id } : {}),
          ...(query.archived !== undefined ? { archived: query.archived } : {}),
          ...(query.search_term ? { search_term: query.search_term } : {}),
          ...(query.cursor ? { cursor: query.cursor } : {}),
          ...(query.limit !== undefined ? { limit: query.limit } : {}),
        },
      }),
    read: (
      hostId: string,
      threadId: string,
      historyCursor?: string | null,
      historyLimit = CODEX_DEFAULT_HISTORY_LIMIT,
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
    rename: (
      hostId: string,
      threadId: string,
      body: CodexConversationRenameRequest,
      idempotencyKey?: string,
    ) =>
      client.patch<CodexOperationAccepted>(
        `${buildCodexThreadPath(hostId, threadId)}/name`,
        body,
        commandOptions(idempotencyKey),
      ),
    updatePin: (
      hostId: string,
      threadId: string,
      body: CodexConversationPinRequest,
    ) =>
      client.patch<CodexThread>(
        `${buildCodexThreadPath(hostId, threadId)}/pin`,
        body,
      ),
    archive: (hostId: string, threadId: string, idempotencyKey?: string) =>
      client.post<CodexOperationAccepted>(
        `${buildCodexThreadPath(hostId, threadId)}/archive`,
        undefined,
        commandOptions(idempotencyKey),
      ),
    unarchive: (hostId: string, threadId: string, idempotencyKey?: string) =>
      client.post<CodexOperationAccepted>(
        `${buildCodexThreadPath(hostId, threadId)}/unarchive`,
        undefined,
        commandOptions(idempotencyKey),
      ),
  }
}
