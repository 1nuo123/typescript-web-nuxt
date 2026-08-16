import {
  CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
  CodexTimelineItemKind,
  CodexTimelineItemSource,
  CodexTimelineItemStatus,
  type CodexCommandTimelineItem,
  type CodexDiffTimelineItem,
  type CodexNoticeTimelineItem,
  type CodexPlanTimelineItem,
  type CodexTextTimelineItem,
  type CodexTimelineItem,
} from '../types/codex-item'
import {
  CodexRealtimeEventType,
  type CodexRealtimeEvent,
} from '../types/codex-realtime'
import type { CodexHost } from '../types/codex-host'
import {
  CodexThreadStatus,
  type CodexThread,
  type CodexThreadHistoryStatus,
} from '../types/codex-thread'
import type { CodexTurn } from '../types/codex-turn'
import type { CodexWorkspace } from '../types/codex-workspace'
import {
  appendCodexContent,
  CODEX_COMMAND_OUTPUT_LIMIT,
  CODEX_TIMELINE_TEXT_LIMIT,
  truncateCodexContent,
} from './codex-content'

export interface CodexSessionProjection {
  hostsById: Record<string, CodexHost>
  workspacesById: Record<string, CodexWorkspace>
  threadsById: Record<string, CodexThread>
  turnsById: Record<string, CodexTurn>
  itemsById: Record<string, CodexTimelineItem>
  orderedItemIdsByThread: Record<string, string[]>
  historyStatusByThread: Record<string, CodexThreadHistoryStatus>
  historyCursorByThread: Record<string, string | null>
  itemSourceById: Record<string, CodexTimelineItemSource>
  protocolWarnings: string[]
}

export const createCodexSessionProjection = (): CodexSessionProjection => ({
  hostsById: {},
  workspacesById: {},
  threadsById: {},
  turnsById: {},
  itemsById: {},
  orderedItemIdsByThread: {},
  historyStatusByThread: {},
  historyCursorByThread: {},
  itemSourceById: {},
  protocolWarnings: [],
})

const retainThreadState = (
  state: CodexSessionProjection,
  threadsById: Record<string, CodexThread>,
): CodexSessionProjection => {
  const retainedThreadIds = new Set(Object.keys(threadsById))
  const itemsById = Object.fromEntries(
    Object.entries(state.itemsById).filter(([, item]) =>
      retainedThreadIds.has(item.header.thread_id),
    ),
  )
  return {
    ...state,
    threadsById,
    turnsById: Object.fromEntries(
      Object.entries(state.turnsById).filter(([, turn]) =>
        retainedThreadIds.has(turn.thread_id),
      ),
    ),
    itemsById,
    orderedItemIdsByThread: Object.fromEntries(
      Object.entries(state.orderedItemIdsByThread).filter(([threadId]) =>
        retainedThreadIds.has(threadId),
      ),
    ),
    historyStatusByThread: Object.fromEntries(
      Object.entries(state.historyStatusByThread).filter(([threadId]) =>
        retainedThreadIds.has(threadId),
      ),
    ),
    historyCursorByThread: Object.fromEntries(
      Object.entries(state.historyCursorByThread).filter(([threadId]) =>
        retainedThreadIds.has(threadId),
      ),
    ),
    itemSourceById: Object.fromEntries(
      Object.entries(state.itemSourceById).filter(([itemId]) =>
        Object.hasOwn(itemsById, itemId),
      ),
    ),
  }
}

export const replaceCodexHosts = (
  state: CodexSessionProjection,
  hosts: CodexHost[],
): CodexSessionProjection => {
  const retainedHostIds = new Set(hosts.map((host) => host.host_id))
  const workspacesById = Object.fromEntries(
    Object.entries(state.workspacesById).filter(([, workspace]) =>
      retainedHostIds.has(workspace.host_id),
    ),
  )
  const threadsById = Object.fromEntries(
    Object.entries(state.threadsById).filter(([, thread]) =>
      retainedHostIds.has(thread.host_id),
    ),
  )
  return retainThreadState(
    {
      ...state,
      hostsById: Object.fromEntries(hosts.map((host) => [host.host_id, host])),
      workspacesById,
    },
    threadsById,
  )
}

export const replaceCodexWorkspacesForHost = (
  state: CodexSessionProjection,
  hostId: string,
  workspaces: CodexWorkspace[],
): CodexSessionProjection => {
  const retainedWorkspaceIds = new Set(
    workspaces.map((workspace) => workspace.workspace_id),
  )
  const workspacesById = {
    ...Object.fromEntries(
      Object.entries(state.workspacesById).filter(
        ([, workspace]) => workspace.host_id !== hostId,
      ),
    ),
    ...Object.fromEntries(
      workspaces.map((workspace) => [workspace.workspace_id, workspace]),
    ),
  }
  const threadsById = Object.fromEntries(
    Object.entries(state.threadsById).filter(
      ([, thread]) =>
        thread.host_id !== hostId ||
        retainedWorkspaceIds.has(thread.workspace_id),
    ),
  )
  return retainThreadState({ ...state, workspacesById }, threadsById)
}

export interface CodexThreadQueryScope {
  hostId: string
  workspaceId: string | null
  archived: boolean
  searchTerm: string
}

export const replaceCodexThreadsForQuery = (
  state: CodexSessionProjection,
  scope: CodexThreadQueryScope,
  threads: CodexThread[],
): CodexSessionProjection => {
  const normalizedSearchTerm = scope.searchTerm.trim()
  const retainedEntries = Object.entries(state.threadsById).filter(
    ([, thread]) => {
      if (normalizedSearchTerm) return true
      if (thread.host_id !== scope.hostId) return true
      if (thread.archived !== scope.archived) return true
      if (scope.workspaceId && thread.workspace_id !== scope.workspaceId)
        return true
      return false
    },
  )
  const threadsById = {
    ...Object.fromEntries(retainedEntries),
    ...Object.fromEntries(
      threads.map((thread) => [
        thread.upstream_thread_id,
        mergeThreadMetadata(
          state.threadsById[thread.upstream_thread_id],
          thread,
        ),
      ]),
    ),
  }
  return retainThreadState(state, threadsById)
}

const upsertItem = (
  state: CodexSessionProjection,
  item: CodexTimelineItem,
  source: CodexTimelineItemSource,
): CodexSessionProjection => {
  const boundedItem = boundTimelineItem(item)
  const orderedIds = state.orderedItemIdsByThread[item.header.thread_id] ?? []
  const nextOrderedIds = orderedIds.includes(item.header.item_id)
    ? orderedIds
    : [...orderedIds, item.header.item_id]
  return {
    ...state,
    itemsById: {
      ...state.itemsById,
      [item.header.item_id]: boundedItem,
    },
    orderedItemIdsByThread: {
      ...state.orderedItemIdsByThread,
      [item.header.thread_id]: nextOrderedIds,
    },
    itemSourceById: {
      ...state.itemSourceById,
      [item.header.item_id]: source,
    },
  }
}

const reconcileOptimisticUserItem = (
  state: CodexSessionProjection,
  item: CodexTimelineItem,
): CodexSessionProjection => {
  if (item.detail.kind !== CodexTimelineItemKind.UserMessage) {
    return state
  }
  const userItem = item as CodexTextTimelineItem
  const orderedIds = state.orderedItemIdsByThread[item.header.thread_id] ?? []
  const optimisticId = orderedIds.find((itemId) => {
    const candidate = state.itemsById[itemId]
    const candidateDetail = candidate?.detail
    const candidateText =
      candidateDetail && 'text' in candidateDetail ? candidateDetail.text : null
    return (
      itemId.startsWith('local-') &&
      candidateDetail?.kind === CodexTimelineItemKind.UserMessage &&
      candidateText === userItem.detail.text
    )
  })
  if (!optimisticId) return state

  const itemsById = Object.fromEntries(
    Object.entries(state.itemsById).filter(
      ([itemId]) => itemId !== optimisticId,
    ),
  )
  return {
    ...state,
    itemsById,
    itemSourceById: Object.fromEntries(
      Object.entries(state.itemSourceById).filter(
        ([itemId]) => itemId !== optimisticId,
      ),
    ),
    orderedItemIdsByThread: {
      ...state.orderedItemIdsByThread,
      [item.header.thread_id]: orderedIds.filter(
        (itemId) => itemId !== optimisticId,
      ),
    },
  }
}

const discardOptimisticThreadItems = (
  state: CodexSessionProjection,
  threadId: string,
): Record<string, CodexTimelineItem> =>
  Object.fromEntries(
    Object.entries(state.itemsById).filter(
      ([itemId, item]) =>
        item.header.thread_id !== threadId ||
        state.itemSourceById[itemId] !== CodexTimelineItemSource.Optimistic,
    ),
  )

const boundTimelineItem = (item: CodexTimelineItem): CodexTimelineItem => {
  if (
    item.detail.kind === CodexTimelineItemKind.UserMessage ||
    item.detail.kind === CodexTimelineItemKind.AgentMessage
  ) {
    const textItem = item as CodexTextTimelineItem
    return {
      ...textItem,
      detail: {
        ...textItem.detail,
        text: truncateCodexContent(
          textItem.detail.text,
          CODEX_TIMELINE_TEXT_LIMIT,
        ),
      },
    }
  }
  if (item.detail.kind === CodexTimelineItemKind.Notice) {
    const noticeItem = item as CodexNoticeTimelineItem
    return {
      ...noticeItem,
      detail: {
        ...noticeItem.detail,
        text: truncateCodexContent(
          noticeItem.detail.text,
          CODEX_TIMELINE_TEXT_LIMIT,
        ),
      },
    }
  }
  if (item.detail.kind === CodexTimelineItemKind.Command) {
    const commandItem = item as CodexCommandTimelineItem
    return {
      ...commandItem,
      detail: {
        ...commandItem.detail,
        command: truncateCodexContent(
          commandItem.detail.command,
          CODEX_TIMELINE_TEXT_LIMIT,
        ),
        output: truncateCodexContent(
          commandItem.detail.output,
          CODEX_COMMAND_OUTPUT_LIMIT,
        ),
      },
    } as CodexCommandTimelineItem
  }
  return item
}

const mergeThreadMetadata = (
  existing: CodexThread | undefined,
  incoming: CodexThread,
): CodexThread => {
  if (!existing) return incoming
  const incomingRecency = Date.parse(incoming.recency_at)
  const existingRecency = Date.parse(existing.recency_at)
  return {
    ...existing,
    ...incoming,
    display_name: incoming.display_name || existing.display_name,
    model: incoming.model || existing.model,
    reasoning_effort: incoming.reasoning_effort || existing.reasoning_effort,
    source_kind: incoming.source_kind || existing.source_kind,
    created_at: incoming.created_at || existing.created_at,
    recency_at:
      Number.isFinite(incomingRecency) && incomingRecency > existingRecency
        ? incoming.recency_at
        : existing.recency_at,
    updated_at: incoming.updated_at || existing.updated_at,
    last_synced_at: incoming.last_synced_at || existing.last_synced_at,
  }
}

const finalizeTurnItems = (
  state: CodexSessionProjection,
  turnId: string,
  failed: boolean,
): Record<string, CodexTimelineItem> =>
  Object.fromEntries(
    Object.entries(state.itemsById).map(([itemId, item]) => [
      itemId,
      item.header.turn_id === turnId &&
      item.header.status === CodexTimelineItemStatus.Streaming
        ? {
            ...item,
            header: {
              ...item.header,
              status: failed
                ? CodexTimelineItemStatus.Failed
                : CodexTimelineItemStatus.Completed,
            },
          }
        : item,
    ]),
  ) as Record<string, CodexTimelineItem>

const advanceThreadActivity = (
  state: CodexSessionProjection,
  threadId: string | null | undefined,
  occurredAt: string,
): CodexSessionProjection => {
  if (!threadId) return state
  const thread = state.threadsById[threadId]
  const occurredAtTimestamp = Date.parse(occurredAt)
  if (
    !thread ||
    !Number.isFinite(occurredAtTimestamp) ||
    occurredAtTimestamp <= Date.parse(thread.recency_at)
  ) {
    return state
  }
  return {
    ...state,
    threadsById: {
      ...state.threadsById,
      [threadId]: {
        ...thread,
        recency_at: occurredAt,
      },
    },
  }
}

const applyItemDelta = (
  state: CodexSessionProjection,
  detail: Extract<
    CodexRealtimeEvent['detail'],
    { kind: CodexRealtimeEventType.ItemDelta }
  >,
): CodexSessionProjection => {
  const existing = state.itemsById[detail.item_id]
  const item: CodexTextTimelineItem = {
    header: {
      item_id: detail.item_id,
      thread_id: detail.thread_id,
      turn_id: detail.turn_id,
      detail_kind: CodexTimelineItemKind.AgentMessage,
      schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
      status: CodexTimelineItemStatus.Streaming,
    },
    detail: {
      kind: CodexTimelineItemKind.AgentMessage,
      schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
      text:
        existing && 'text' in existing.detail
          ? appendCodexContent(
              existing.detail.text,
              detail.delta,
              CODEX_TIMELINE_TEXT_LIMIT,
            )
          : truncateCodexContent(detail.delta, CODEX_TIMELINE_TEXT_LIMIT),
    },
  }
  return upsertItem(state, item, CodexTimelineItemSource.Realtime)
}

export const reduceCodexRealtimeEvent = (
  state: CodexSessionProjection,
  event: CodexRealtimeEvent,
): CodexSessionProjection => {
  const detail = event.detail
  const activityState = [
    CodexRealtimeEventType.TurnStarted,
    CodexRealtimeEventType.TurnCompleted,
    CodexRealtimeEventType.TurnFailed,
    CodexRealtimeEventType.TurnInterrupted,
    CodexRealtimeEventType.ItemUpsert,
    CodexRealtimeEventType.ApprovalOpened,
    CodexRealtimeEventType.ApprovalResolved,
  ].includes(detail.kind)
    ? advanceThreadActivity(
        state,
        event.header.thread_id,
        event.header.occurred_at,
      )
    : state
  switch (detail.kind) {
    case CodexRealtimeEventType.HostSnapshot:
      return replaceCodexHosts(state, detail.hosts)
    case CodexRealtimeEventType.HostStatusChanged: {
      const host = activityState.hostsById[detail.host_id]
      if (!host) return activityState
      return {
        ...activityState,
        hostsById: {
          ...activityState.hostsById,
          [host.host_id]: {
            ...host,
            status: detail.status,
            last_seen_at: detail.last_seen_at ?? host.last_seen_at,
          },
        },
      }
    }
    case CodexRealtimeEventType.WorkspaceSnapshot:
      return {
        ...state,
        workspacesById: Object.fromEntries(
          detail.workspaces.map((workspace) => [
            workspace.workspace_id,
            workspace,
          ]),
        ),
      }
    case CodexRealtimeEventType.ThreadSnapshot: {
      const threadId = detail.thread.upstream_thread_id
      const mergedThread = mergeThreadMetadata(
        state.threadsById[threadId],
        detail.thread,
      )
      const snapshotMetadata: CodexSessionProjection = {
        ...state,
        threadsById: {
          ...state.threadsById,
          [threadId]: mergedThread,
        },
        historyStatusByThread: {
          ...state.historyStatusByThread,
          [threadId]: detail.history_status,
        },
        historyCursorByThread: {
          ...state.historyCursorByThread,
          [threadId]: detail.next_history_cursor ?? null,
        },
      }
      let nextState: CodexSessionProjection = {
        ...snapshotMetadata,
        turnsById: {
          ...state.turnsById,
          ...Object.fromEntries(
            detail.turns.map((turn) => [turn.turn_id, turn]),
          ),
        },
        itemsById: detail.append_history
          ? state.itemsById
          : discardOptimisticThreadItems(state, threadId),
        itemSourceById: detail.append_history
          ? state.itemSourceById
          : Object.fromEntries(
              Object.entries(state.itemSourceById).filter(
                ([itemId]) =>
                  state.itemsById[itemId]?.header.thread_id !== threadId ||
                  state.itemSourceById[itemId] !==
                    CodexTimelineItemSource.Optimistic,
              ),
            ),
        orderedItemIdsByThread: {
          ...state.orderedItemIdsByThread,
          [threadId]: detail.append_history
            ? (state.orderedItemIdsByThread[threadId] ?? [])
            : (state.orderedItemIdsByThread[threadId] ?? []).filter(
                (itemId) =>
                  state.itemSourceById[itemId] !==
                  CodexTimelineItemSource.Optimistic,
              ),
        },
      }
      for (const item of detail.items)
        nextState = upsertItem(
          nextState,
          item,
          CodexTimelineItemSource.Snapshot,
        )
      return nextState
    }
    case CodexRealtimeEventType.ThreadUpdated: {
      const existing =
        activityState.threadsById[detail.thread.upstream_thread_id]
      if (!existing) return activityState
      const merged = mergeThreadMetadata(existing, detail.thread as CodexThread)
      return {
        ...activityState,
        threadsById: {
          ...activityState.threadsById,
          [detail.thread.upstream_thread_id]: merged,
        },
      }
    }
    case CodexRealtimeEventType.TurnStarted:
    case CodexRealtimeEventType.TurnCompleted:
    case CodexRealtimeEventType.TurnFailed:
    case CodexRealtimeEventType.TurnInterrupted: {
      const turn = detail.turn
      const thread = activityState.threadsById[turn.thread_id]
      const isStarted = detail.kind === CodexRealtimeEventType.TurnStarted
      const nextThread = thread
        ? {
            ...thread,
            active_turn_id: isStarted ? turn.turn_id : null,
            status: isStarted
              ? CodexThreadStatus.Active
              : detail.kind === CodexRealtimeEventType.TurnInterrupted
                ? CodexThreadStatus.Interrupted
                : CodexThreadStatus.Idle,
          }
        : null
      const terminalFailed =
        detail.kind === CodexRealtimeEventType.TurnFailed ||
        detail.kind === CodexRealtimeEventType.TurnInterrupted
      return {
        ...activityState,
        itemsById: isStarted
          ? activityState.itemsById
          : finalizeTurnItems(activityState, turn.turn_id, terminalFailed),
        turnsById: {
          ...activityState.turnsById,
          [turn.turn_id]: turn,
        },
        ...(nextThread
          ? {
              threadsById: {
                ...activityState.threadsById,
                [turn.thread_id]: nextThread,
              },
            }
          : {}),
      }
    }
    case CodexRealtimeEventType.ItemUpsert:
      return upsertItem(
        reconcileOptimisticUserItem(activityState, detail.item),
        detail.item,
        CodexTimelineItemSource.Realtime,
      )
    case CodexRealtimeEventType.ItemDelta:
      return applyItemDelta(state, detail)
    case CodexRealtimeEventType.TurnPlanUpdated: {
      const item: CodexPlanTimelineItem = {
        header: {
          item_id: detail.item_id,
          thread_id: detail.thread_id,
          turn_id: detail.turn_id,
          detail_kind: CodexTimelineItemKind.Plan,
          schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
          status: CodexTimelineItemStatus.Streaming,
        },
        detail: {
          kind: CodexTimelineItemKind.Plan,
          schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
          explanation: detail.explanation,
          steps: detail.steps,
        },
      }
      return upsertItem(activityState, item, CodexTimelineItemSource.Realtime)
    }
    case CodexRealtimeEventType.TurnDiffUpdated: {
      const item: CodexDiffTimelineItem = {
        header: {
          item_id: detail.item_id,
          thread_id: detail.thread_id,
          turn_id: detail.turn_id,
          detail_kind: CodexTimelineItemKind.Diff,
          schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
          status: CodexTimelineItemStatus.Streaming,
        },
        detail: {
          kind: CodexTimelineItemKind.Diff,
          schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
          diff: detail.diff,
        },
      }
      return upsertItem(activityState, item, CodexTimelineItemSource.Realtime)
    }
    case CodexRealtimeEventType.ProtocolWarning:
      return {
        ...activityState,
        protocolWarnings: [
          ...activityState.protocolWarnings,
          detail.warning,
        ].slice(-20),
      }
    default:
      return activityState
  }
}
