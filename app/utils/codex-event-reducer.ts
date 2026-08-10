import {
  CodexTimelineItemKind,
  CodexTimelineItemStatus,
  type CodexDiffTimelineItem,
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
  CodexThreadHistoryStatus,
  type CodexThread,
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
  protocolWarnings: [],
})

const upsertItem = (
  state: CodexSessionProjection,
  item: CodexTimelineItem,
): CodexSessionProjection => {
  const boundedItem = boundTimelineItem(item)
  const orderedIds = state.orderedItemIdsByThread[item.thread_id] ?? []
  const nextOrderedIds = orderedIds.includes(item.item_id)
    ? orderedIds
    : [...orderedIds, item.item_id]
  return {
    ...state,
    itemsById: { ...state.itemsById, [item.item_id]: boundedItem },
    orderedItemIdsByThread: {
      ...state.orderedItemIdsByThread,
      [item.thread_id]: nextOrderedIds,
    },
  }
}

const reconcileOptimisticUserItem = (
  state: CodexSessionProjection,
  item: CodexTimelineItem,
): CodexSessionProjection => {
  if (item.kind !== CodexTimelineItemKind.UserMessage || !('text' in item)) {
    return state
  }
  const orderedIds = state.orderedItemIdsByThread[item.thread_id] ?? []
  const optimisticId = orderedIds.find((itemId) => {
    const candidate = state.itemsById[itemId]
    return (
      itemId.startsWith('local-') &&
      candidate?.kind === CodexTimelineItemKind.UserMessage &&
      'text' in candidate &&
      candidate.text === item.text
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
    orderedItemIdsByThread: {
      ...state.orderedItemIdsByThread,
      [item.thread_id]: orderedIds.filter((itemId) => itemId !== optimisticId),
    },
  }
}

const discardThreadItems = (
  state: CodexSessionProjection,
  threadId: string,
): Record<string, CodexTimelineItem> =>
  Object.fromEntries(
    Object.entries(state.itemsById).filter(
      ([, item]) => item.thread_id !== threadId,
    ),
  )

const boundTimelineItem = (item: CodexTimelineItem): CodexTimelineItem => {
  if ('text' in item) {
    return {
      ...item,
      text: truncateCodexContent(item.text, CODEX_TIMELINE_TEXT_LIMIT),
    }
  }
  if (item.kind === CodexTimelineItemKind.Command) {
    return {
      ...item,
      command: truncateCodexContent(item.command, CODEX_TIMELINE_TEXT_LIMIT),
      output: truncateCodexContent(item.output, CODEX_COMMAND_OUTPUT_LIMIT),
    }
  }
  return item
}

const applyItemDelta = (
  state: CodexSessionProjection,
  event: Extract<
    CodexRealtimeEvent,
    { type: CodexRealtimeEventType.ItemDelta }
  >,
): CodexSessionProjection => {
  const existing = state.itemsById[event.payload.item_id]
  const item: CodexTextTimelineItem = {
    item_id: event.payload.item_id,
    thread_id: event.payload.thread_id,
    turn_id: event.payload.turn_id,
    kind: CodexTimelineItemKind.AgentMessage,
    status: CodexTimelineItemStatus.Streaming,
    text:
      existing && 'text' in existing
        ? appendCodexContent(
            existing.text,
            event.payload.delta,
            CODEX_TIMELINE_TEXT_LIMIT,
          )
        : truncateCodexContent(event.payload.delta, CODEX_TIMELINE_TEXT_LIMIT),
  }
  return upsertItem(state, item)
}

export const reduceCodexRealtimeEvent = (
  state: CodexSessionProjection,
  event: CodexRealtimeEvent,
): CodexSessionProjection => {
  switch (event.type) {
    case CodexRealtimeEventType.HostSnapshot:
      return {
        ...state,
        hostsById: Object.fromEntries(
          event.payload.hosts.map((host) => [host.host_id, host]),
        ),
      }
    case CodexRealtimeEventType.HostStatusChanged: {
      const host = state.hostsById[event.payload.host_id]
      if (!host) return state
      return {
        ...state,
        hostsById: {
          ...state.hostsById,
          [host.host_id]: {
            ...host,
            status: event.payload.status,
            last_seen_at: event.payload.last_seen_at ?? host.last_seen_at,
          },
        },
      }
    }
    case CodexRealtimeEventType.WorkspaceSnapshot:
      return {
        ...state,
        workspacesById: Object.fromEntries(
          event.payload.workspaces.map((workspace) => [
            workspace.workspace_id,
            workspace,
          ]),
        ),
      }
    case CodexRealtimeEventType.ThreadSnapshot: {
      const threadId = event.payload.thread.upstream_thread_id
      const snapshotMetadata: CodexSessionProjection = {
        ...state,
        threadsById: {
          ...state.threadsById,
          [threadId]: event.payload.thread,
        },
        historyStatusByThread: {
          ...state.historyStatusByThread,
          [threadId]: event.payload.history_status,
        },
        historyCursorByThread: {
          ...state.historyCursorByThread,
          [threadId]: event.payload.next_history_cursor ?? null,
        },
      }
      if (event.payload.history_status !== CodexThreadHistoryStatus.Complete) {
        return snapshotMetadata
      }
      let nextState: CodexSessionProjection = {
        ...snapshotMetadata,
        turnsById: {
          ...state.turnsById,
          ...Object.fromEntries(
            event.payload.turns.map((turn) => [turn.turn_id, turn]),
          ),
        },
        itemsById: event.payload.append_history
          ? state.itemsById
          : discardThreadItems(state, threadId),
        orderedItemIdsByThread: {
          ...state.orderedItemIdsByThread,
          [threadId]: event.payload.append_history
            ? (state.orderedItemIdsByThread[threadId] ?? [])
            : [],
        },
      }
      for (const item of event.payload.items)
        nextState = upsertItem(nextState, item)
      return nextState
    }
    case CodexRealtimeEventType.ThreadUpdated: {
      const existing =
        state.threadsById[event.payload.thread.upstream_thread_id]
      if (!existing) return state
      const merged: CodexThread = { ...existing, ...event.payload.thread }
      return {
        ...state,
        threadsById: {
          ...state.threadsById,
          [event.payload.thread.upstream_thread_id]: merged,
        },
      }
    }
    case CodexRealtimeEventType.TurnStarted:
    case CodexRealtimeEventType.TurnCompleted:
    case CodexRealtimeEventType.TurnFailed:
    case CodexRealtimeEventType.TurnInterrupted: {
      const turn = event.payload.turn
      const thread = state.threadsById[turn.thread_id]
      const isStarted = event.type === CodexRealtimeEventType.TurnStarted
      const nextThread = thread
        ? {
            ...thread,
            active_turn_id: isStarted ? turn.turn_id : null,
            status: isStarted
              ? 'active'
              : event.type === CodexRealtimeEventType.TurnInterrupted
                ? 'interrupted'
                : 'idle',
          }
        : null
      return {
        ...state,
        turnsById: {
          ...state.turnsById,
          [turn.turn_id]: turn,
        },
        ...(nextThread
          ? {
              threadsById: {
                ...state.threadsById,
                [turn.thread_id]: nextThread,
              },
            }
          : {}),
      }
    }
    case CodexRealtimeEventType.ItemUpsert:
      return upsertItem(
        reconcileOptimisticUserItem(state, event.payload.item),
        event.payload.item,
      )
    case CodexRealtimeEventType.ItemDelta:
      return applyItemDelta(state, event)
    case CodexRealtimeEventType.TurnPlanUpdated: {
      const item: CodexPlanTimelineItem = {
        item_id: event.payload.item_id,
        thread_id: event.payload.thread_id,
        turn_id: event.payload.turn_id,
        kind: CodexTimelineItemKind.Plan,
        status: CodexTimelineItemStatus.Streaming,
        explanation: event.payload.explanation,
        steps: event.payload.steps,
      }
      return upsertItem(state, item)
    }
    case CodexRealtimeEventType.TurnDiffUpdated: {
      const item: CodexDiffTimelineItem = {
        item_id: event.payload.item_id,
        thread_id: event.payload.thread_id,
        turn_id: event.payload.turn_id,
        kind: CodexTimelineItemKind.Diff,
        status: CodexTimelineItemStatus.Streaming,
        diff: event.payload.diff,
      }
      return upsertItem(state, item)
    }
    case CodexRealtimeEventType.ProtocolWarning:
      return {
        ...state,
        protocolWarnings: [
          ...state.protocolWarnings,
          event.payload.warning,
        ].slice(-20),
      }
    default:
      return state
  }
}
