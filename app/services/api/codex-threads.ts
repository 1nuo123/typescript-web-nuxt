import type { CodexContentReadRequest } from '~/types/codex-content'
import { parseCodexContentChunk } from '~/utils/codex-content-contract'
import type { CodexExecutionOptions } from '~/types/codex-thread'
import type {
  CodexConversationListQuery,
  CodexConversationPinRequest,
  CodexConversationRenameRequest,
  CodexThread,
  CodexThreadCollection,
  CodexThreadCreateRequest,
  CodexThreadAuthoritySnapshot,
  CodexThreadHistoryItemReload,
  CodexThreadHistoryPage,
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

const CODEX_DEFAULT_HISTORY_LIMIT = 50

export const buildCodexThreadsPath = (hostId: string): string =>
  `/codex/hosts/${encodeURIComponent(hostId)}/threads`

export const buildCodexThreadPath = (
  hostId: string,
  threadId: string,
): string => `${buildCodexThreadsPath(hostId)}/${encodeURIComponent(threadId)}`

const buildCodexThreadHistoryPath = (
  hostId: string,
  threadId: string,
): string => `${buildCodexThreadPath(hostId, threadId)}/history`

const buildCodexThreadHistoryItemsPath = (
  hostId: string,
  threadId: string,
): string => `${buildCodexThreadHistoryPath(hostId, threadId)}/items`

const commandOptions = (idempotencyKey?: string) => ({
  headers: buildCodexIdempotencyHeaders(
    idempotencyKey ?? createCodexIdempotencyKey(),
  ),
})

/** turn 的 body 身份与 HTTP 幂等头必须完全相同，服务端会拒绝不一致请求。 */
const turnCommandOptions = (body: CodexTurnMessageRequest) => ({
  headers: buildCodexIdempotencyHeaders(body.client_operation_id),
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
      historyLimit = CODEX_DEFAULT_HISTORY_LIMIT,
      includeHistory = true,
      signal?: AbortSignal,
    ) =>
      client.get<CodexThreadAuthoritySnapshot>(
        buildCodexThreadPath(hostId, threadId),
        {
          timeout: 35_000,
          retry: 0,
          signal,
          query: {
            content_mode: 'bounded',
            include_history: includeHistory,
            history_limit: historyLimit,
          },
        },
      ),
    readHistory: (
      hostId: string,
      threadId: string,
      beforeCursor: string,
      historyLimit = CODEX_DEFAULT_HISTORY_LIMIT,
      signal?: AbortSignal,
    ) =>
      client.get<CodexThreadHistoryPage>(
        buildCodexThreadHistoryPath(hostId, threadId),
        {
          timeout: 35_000,
          retry: 0,
          signal,
          query: {
            content_mode: 'bounded',
            before_cursor: beforeCursor,
            limit: historyLimit,
          },
        },
      ),
    readHistoryItems: (
      hostId: string,
      threadId: string,
      itemIds: readonly string[],
      signal?: AbortSignal,
    ) =>
      client.get<CodexThreadHistoryItemReload>(
        buildCodexThreadHistoryItemsPath(hostId, threadId),
        {
          timeout: 35_000,
          retry: 0,
          signal,
          query: { content_mode: 'bounded', item_id: [...itemIds] },
        },
      ),
    readContent: async (
      hostId: string,
      threadId: string,
      itemId: string,
      body: CodexContentReadRequest,
      signal?: AbortSignal,
    ) =>
      parseCodexContentChunk(
        await client.post<unknown>(
          `${buildCodexThreadHistoryItemsPath(hostId, threadId)}/${encodeURIComponent(itemId)}/content/read`,
          body,
          { signal, timeout: 35_000, retry: 0 },
        ),
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
    resume: (
      hostId: string,
      threadId: string,
      execution: CodexExecutionOptions,
      idempotencyKey?: string,
    ) =>
      client.post<CodexOperationAccepted>(
        `${buildCodexThreadPath(hostId, threadId)}/resume`,
        execution,
        commandOptions(idempotencyKey),
      ),
    startTurn: (
      hostId: string,
      threadId: string,
      body: CodexTurnMessageRequest,
    ) =>
      client.post<CodexOperationAccepted>(
        `${buildCodexThreadPath(hostId, threadId)}/turns`,
        body,
        turnCommandOptions(body),
      ),
    steer: (hostId: string, threadId: string, body: CodexTurnMessageRequest) =>
      client.post<CodexOperationAccepted>(
        `${buildCodexThreadPath(hostId, threadId)}/steer`,
        body,
        turnCommandOptions(body),
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
