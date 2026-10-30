import { normalizeCodexTimelineItem } from './codex-contract-normalizer'
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
  type CodexTimelineRenderableItem,
} from '../types/codex-item'
import {
  CodexRealtimeEventType,
  type CodexRealtimeEvent,
} from '../types/codex-realtime'
import type { CodexHost } from '../types/codex-host'
import {
  CodexThreadStatus,
  type CodexThread,
  type CodexThreadHistoryPage,
  CodexThreadHistoryStatus,
} from '../types/codex-thread'
import type { CodexTurn } from '../types/codex-turn'
import type { CodexWorkspace } from '../types/codex-workspace'
import {
  appendCodexContent,
  CODEX_COMMAND_OUTPUT_LIMIT,
  CODEX_TIMELINE_TEXT_LIMIT,
  truncateCodexContent,
} from './codex-content'
import { getFullyCoveredTerminalTurnIds } from './codex-snapshot-coverage'

export interface CodexSessionProjection {
  snapshotSourceByThread: Record<
    string,
    { epoch: string; seq: number; itemIds: Record<string, true> }
  >
  hostsById: Record<string, CodexHost>
  workspacesById: Record<string, CodexWorkspace>
  threadsById: Record<string, CodexThread>
  turnsById: Record<string, CodexTurn>
  itemsById: Record<string, CodexTimelineRenderableItem>
  orderedItemIdsByThread: Record<string, string[]>
  /** 已按时间线顺序物化的数组，数组替换即可触发视图更新。 */
  timelineItemsByThread: Record<string, CodexTimelineRenderableItem[]>
  /** 稳定 item ID 到数组下标的索引，避免 delta 更新时再次线性查找。 */
  timelineItemIndexByThread: Record<string, Record<string, number>>
  historyStatusByThread: Record<string, CodexThreadHistoryStatus>
  historyCursorByThread: Record<string, string | null>
  historyRevisionByThread: Record<string, string | null>
  itemSourceById: Record<string, CodexTimelineItemSource>
  protocolWarnings: string[]
}

export const CODEX_TIMELINE_BODY_EVICTION_HIGH_WATER_BYTES = 20 * 1024 * 1024
export const CODEX_TIMELINE_BODY_EVICTION_TARGET_BYTES = 16 * 1024 * 1024

/** 原始 item ID 仅在所属主机/会话内有意义，禁止直接用作全局索引。 */
export const codexItemKey = (
  state: CodexSessionProjection,
  threadId: string,
  itemId: string,
): string =>
  JSON.stringify([state.threadsById[threadId]?.host_id ?? '', threadId, itemId])

/** 冻结数组本身，令 Vue 无需为整条时间线建立深层代理；条目更新通过替换数组完成。 */
const freezeTimelineItems = (
  items: readonly CodexTimelineRenderableItem[],
): CodexTimelineRenderableItem[] =>
  Object.freeze([...items]) as unknown as CodexTimelineRenderableItem[]

const isCodexTimelineItem = (
  item: CodexTimelineRenderableItem,
): item is CodexTimelineItem => item.detail.kind !== 'evicted'

export const createCodexSessionProjection = (): CodexSessionProjection => ({
  snapshotSourceByThread: {},
  hostsById: {},
  workspacesById: {},
  threadsById: {},
  turnsById: {},
  itemsById: {},
  orderedItemIdsByThread: {},
  timelineItemsByThread: {},
  timelineItemIndexByThread: {},
  historyStatusByThread: {},
  historyCursorByThread: {},
  historyRevisionByThread: {},
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
    snapshotSourceByThread: Object.fromEntries(
      Object.entries(state.snapshotSourceByThread).filter(([threadId]) =>
        retainedThreadIds.has(threadId),
      ),
    ),
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
    timelineItemsByThread: Object.fromEntries(
      Object.entries(state.timelineItemsByThread).filter(([threadId]) =>
        retainedThreadIds.has(threadId),
      ),
    ),
    timelineItemIndexByThread: Object.fromEntries(
      Object.entries(state.timelineItemIndexByThread).filter(([threadId]) =>
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
    historyRevisionByThread: Object.fromEntries(
      Object.entries(state.historyRevisionByThread).filter(([threadId]) =>
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
  const retainedEntries = Object.entries(state.threadsById).filter(
    ([, thread]) => {
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
  const threadId = item.header.thread_id
  const itemId = item.header.item_id
  const orderedIds = state.orderedItemIdsByThread[threadId] ?? []
  const existingTimeline =
    state.timelineItemsByThread[threadId] ??
    orderedIds.flatMap((orderedId) => {
      const orderedItem =
        state.itemsById[codexItemKey(state, threadId, orderedId)]
      return orderedItem ? [orderedItem] : []
    })
  const optimisticItemId =
    item.detail.kind === CodexTimelineItemKind.UserMessage &&
    item.header.client_operation_id
      ? `local-${item.header.client_operation_id}`
      : null
  const optimisticIndex = optimisticItemId
    ? orderedIds.indexOf(optimisticItemId)
    : -1
  const shouldReconcileOptimistic =
    optimisticItemId !== null &&
    optimisticItemId !== itemId &&
    optimisticIndex >= 0 &&
    state.itemSourceById[codexItemKey(state, threadId, optimisticItemId)] ===
      CodexTimelineItemSource.Optimistic
  let nextTimeline = [...existingTimeline]
  let nextOrderedIds = orderedIds
  let nextItemsById = { ...state.itemsById }
  let nextItemSourceById = { ...state.itemSourceById }
  let reconciledIndex = -1
  if (shouldReconcileOptimistic) {
    // 官方 item 只按 client_operation_id 对账，替换本地占位符并保留原时间线位置。
    nextOrderedIds = orderedIds.filter(
      (orderedId) => orderedId !== optimisticItemId && orderedId !== itemId,
    )
    nextTimeline = nextTimeline.filter(
      (timelineItem) =>
        timelineItem.header.item_id !== optimisticItemId &&
        timelineItem.header.item_id !== itemId,
    )
    reconciledIndex = Math.min(optimisticIndex, nextOrderedIds.length)
    nextOrderedIds.splice(reconciledIndex, 0, itemId)
    nextTimeline.splice(reconciledIndex, 0, boundedItem)
    const optimisticKey = codexItemKey(state, threadId, optimisticItemId)
    const { [optimisticKey]: _optimisticItem, ...itemsWithoutOptimistic } =
      nextItemsById
    const { [optimisticKey]: _optimisticSource, ...sourcesWithoutOptimistic } =
      nextItemSourceById
    nextItemsById = itemsWithoutOptimistic
    nextItemSourceById = sourcesWithoutOptimistic
  }
  const existingIndex =
    reconciledIndex >= 0
      ? reconciledIndex
      : (state.timelineItemIndexByThread[threadId]?.[itemId] ??
        existingTimeline.findIndex(
          (timelineItem) => timelineItem.header.item_id === itemId,
        ))
  let nextIndex = state.timelineItemIndexByThread[threadId]
  if (reconciledIndex < 0 && existingIndex < 0) {
    nextTimeline.push(boundedItem)
    nextOrderedIds = [...orderedIds, itemId]
    nextIndex = { ...(nextIndex ?? {}), [itemId]: existingTimeline.length }
  } else if (reconciledIndex < 0) {
    nextTimeline[existingIndex] = boundedItem
    nextIndex =
      nextIndex ??
      Object.fromEntries(
        existingTimeline.map((timelineItem, index) => [
          timelineItem.header.item_id,
          index,
        ]),
      )
  }
  if (reconciledIndex >= 0) {
    nextIndex = Object.fromEntries(
      nextTimeline.map((timelineItem, index) => [
        timelineItem.header.item_id,
        index,
      ]),
    )
  }
  nextItemsById[codexItemKey(state, threadId, itemId)] = boundedItem
  nextItemSourceById[codexItemKey(state, threadId, itemId)] = source
  return {
    ...state,
    itemsById: nextItemsById,
    orderedItemIdsByThread: {
      ...state.orderedItemIdsByThread,
      [threadId]: nextOrderedIds,
    },
    timelineItemsByThread: {
      ...state.timelineItemsByThread,
      [threadId]: freezeTimelineItems(nextTimeline),
    },
    timelineItemIndexByThread: {
      ...state.timelineItemIndexByThread,
      [threadId]: nextIndex ?? {},
    },
    itemSourceById: nextItemSourceById,
  }
}

/**
 * A complete history page is authoritative only for terminal turns whose
 * entire item group it contains. Live and history item identifiers can differ,
 * so replace those groups by turn authority rather than guessing a message
 * correspondence from content or position.
 */
const replaceFullyCoveredSnapshotTurns = (
  state: CodexSessionProjection,
  threadId: string,
  snapshotItems: readonly CodexTimelineItem[],
  fullyCoveredTurnIds: ReadonlySet<string>,
): CodexSessionProjection => {
  if (!fullyCoveredTurnIds.size) return state

  const snapshotItemIds = snapshotItems
    .filter((item) => item.header.thread_id === threadId)
    .map((item) => item.header.item_id)
  const snapshotIds = new Set(snapshotItemIds)
  const replacesItem = (itemId: string): boolean => {
    const item = state.itemsById[codexItemKey(state, threadId, itemId)]
    return (
      snapshotIds.has(itemId) ||
      (item?.header.thread_id === threadId &&
        item.header.turn_id !== null &&
        fullyCoveredTurnIds.has(item.header.turn_id))
    )
  }
  const nextOrderedIds: string[] = []
  let insertedSnapshot = false
  for (const itemId of state.orderedItemIdsByThread[threadId] ?? []) {
    if (!replacesItem(itemId)) {
      nextOrderedIds.push(itemId)
      continue
    }
    if (!insertedSnapshot) {
      // Keep the whole page in authority order, including partial/active turns.
      // Only covered terminal turns lose items absent from the page.
      nextOrderedIds.push(...snapshotItemIds)
      insertedSnapshot = true
    }
  }

  const itemsById = Object.fromEntries(
    Object.entries(state.itemsById).filter(
      ([, item]) =>
        item.header.thread_id !== threadId ||
        !replacesItem(item.header.item_id) ||
        snapshotIds.has(item.header.item_id),
    ),
  ) as Record<string, CodexTimelineRenderableItem>
  const itemSourceById = Object.fromEntries(
    Object.entries(state.itemSourceById).filter(([itemId]) =>
      Object.hasOwn(itemsById, itemId),
    ),
  ) as Record<string, CodexTimelineItemSource>
  const timeline = nextOrderedIds.flatMap((itemId) => {
    const item = itemsById[codexItemKey(state, threadId, itemId)]
    return item ? [item] : []
  })
  return {
    ...state,
    itemsById,
    itemSourceById,
    orderedItemIdsByThread: {
      ...state.orderedItemIdsByThread,
      [threadId]: nextOrderedIds,
    },
    timelineItemsByThread: {
      ...state.timelineItemsByThread,
      [threadId]: freezeTimelineItems(timeline),
    },
    timelineItemIndexByThread: {
      ...state.timelineItemIndexByThread,
      [threadId]: Object.fromEntries(
        timeline.map((item, index) => [item.header.item_id, index]),
      ),
    },
  }
}

/** 只替换一个已存在条目，保持其它条目的对象引用和有序 ID 列表稳定。 */
const replaceTimelineItem = (
  state: CodexSessionProjection,
  item: CodexTimelineRenderableItem,
): CodexSessionProjection => {
  const threadId = item.header.thread_id
  const itemId = item.header.item_id
  const orderedIds = state.orderedItemIdsByThread[threadId] ?? []
  const timeline =
    state.timelineItemsByThread[threadId] ??
    orderedIds.flatMap((orderedId) => {
      const orderedItem =
        state.itemsById[codexItemKey(state, threadId, orderedId)]
      return orderedItem ? [orderedItem] : []
    })
  const index =
    state.timelineItemIndexByThread[threadId]?.[itemId] ??
    timeline.findIndex((timelineItem) => timelineItem.header.item_id === itemId)
  if (index < 0) return state
  const nextTimeline = [...timeline]
  nextTimeline[index] = item
  return {
    ...state,
    itemsById: {
      ...state.itemsById,
      [codexItemKey(state, threadId, itemId)]: item,
    },
    timelineItemsByThread: {
      ...state.timelineItemsByThread,
      [threadId]: freezeTimelineItems(nextTimeline),
    },
    timelineItemIndexByThread: {
      ...state.timelineItemIndexByThread,
      [threadId]:
        state.timelineItemIndexByThread[threadId] ??
        Object.fromEntries(
          timeline.map((timelineItem, itemIndex) => [
            timelineItem.header.item_id,
            itemIndex,
          ]),
        ),
    },
  }
}

export const upsertCodexTimelineItem = upsertItem
export const replaceCodexTimelineItem = replaceTimelineItem

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

const readTimelineBodyBytes = (item: CodexTimelineRenderableItem): number => {
  if (item.detail.kind === 'evicted') return 0
  return new TextEncoder().encode(JSON.stringify(item.detail)).byteLength
}

/**
 * 超过软预算时仅回收当前线程最旧且不可见的已完成正文。占位符保留原始
 * item ID、类型、时间和状态，恢复路径只能按 ID 回读当前权威历史。
 */
export const evictCodexTimelineBodies = (
  state: CodexSessionProjection,
  threadId: string,
  protectedItemIds: ReadonlySet<string>,
  contentBytes = 0,
): CodexSessionProjection => {
  const orderedItemIds = state.orderedItemIdsByThread[threadId] ?? []
  let retainedBytes = orderedItemIds.reduce((total, itemId) => {
    const item = state.itemsById[codexItemKey(state, threadId, itemId)]
    return total + (item ? readTimelineBodyBytes(item) : 0)
  }, 0)
  if (
    retainedBytes + contentBytes <=
    CODEX_TIMELINE_BODY_EVICTION_HIGH_WATER_BYTES
  )
    return state
  const itemsById = { ...state.itemsById }
  let changed = false
  for (const itemId of orderedItemIds) {
    if (
      retainedBytes + contentBytes <=
      CODEX_TIMELINE_BODY_EVICTION_TARGET_BYTES
    )
      break
    const item = itemsById[codexItemKey(state, threadId, itemId)]
    if (
      !item ||
      item.detail.kind === 'evicted' ||
      item.header.status === CodexTimelineItemStatus.Streaming ||
      protectedItemIds.has(itemId)
    ) {
      continue
    }
    retainedBytes -= readTimelineBodyBytes(item)
    itemsById[codexItemKey(state, threadId, itemId)] = {
      header: item.header,
      detail: {
        kind: 'evicted',
        schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
        original_kind: item.detail.kind,
      },
    }
    changed = true
  }
  if (!changed) return state
  const timeline = orderedItemIds.flatMap((itemId) => {
    const item = itemsById[codexItemKey(state, threadId, itemId)]
    return item ? [item] : []
  })
  return {
    ...state,
    itemsById,
    timelineItemsByThread: {
      ...state.timelineItemsByThread,
      [threadId]: freezeTimelineItems(timeline),
    },
    timelineItemIndexByThread: {
      ...state.timelineItemIndexByThread,
      [threadId]: Object.fromEntries(
        timeline.map((item, index) => [item.header.item_id, index]),
      ),
    },
  }
}

/** 恢复已回收占位符的权威正文；未在当前时间线中的 ID 不得被该路径新增。 */
export const restoreCodexTimelineBodies = (
  state: CodexSessionProjection,
  items: readonly CodexTimelineItem[],
): CodexSessionProjection => {
  const restored = items
    .map((item) => normalizeCodexTimelineItem(item))
    .filter((item) => {
      const current =
        state.itemsById[
          codexItemKey(state, item.header.thread_id, item.header.item_id)
        ]
      return (
        current &&
        (current.detail.kind === 'evicted' ||
          (current.header.status !== CodexTimelineItemStatus.Streaming &&
            Boolean(current.detail.content)))
      )
    })
  if (!restored.length) return state
  const itemsById = {
    ...state.itemsById,
    ...Object.fromEntries(
      restored.map((item) => [
        codexItemKey(state, item.header.thread_id, item.header.item_id),
        boundTimelineItem(item),
      ]),
    ),
  }
  const updatedThreadIds = new Set(
    restored.map((item) => item.header.thread_id),
  )
  const timelineItemsByThread = { ...state.timelineItemsByThread }
  const timelineItemIndexByThread = { ...state.timelineItemIndexByThread }
  for (const threadId of updatedThreadIds) {
    const orderedIds = state.orderedItemIdsByThread[threadId] ?? []
    const timeline = orderedIds.flatMap((itemId) => {
      const item = itemsById[codexItemKey(state, threadId, itemId)]
      return item ? [item] : []
    })
    timelineItemsByThread[threadId] = freezeTimelineItems(timeline)
    timelineItemIndexByThread[threadId] = Object.fromEntries(
      timeline.map((item, index) => [item.header.item_id, index]),
    )
  }
  return {
    ...state,
    itemsById,
    timelineItemsByThread,
    timelineItemIndexByThread,
  }
}

/**
 * 旧页必须在本地窗口前端插入，不能复用实时 item 的末尾追加语义；
 * 否则虚拟时间线会颠倒历史顺序并破坏阅读锚点。
 */
export const prependCodexHistoryPage = (
  state: CodexSessionProjection,
  threadId: string,
  page: CodexThreadHistoryPage,
): CodexSessionProjection => {
  page = {
    ...page,
    items: page.items.map((item) => normalizeCodexTimelineItem(item)),
  }
  const revision = state.historyRevisionByThread[threadId]
  if (revision && revision !== page.history_revision)
    throw new Error('历史版本已变化，请重新加载会话。')
  const existingIds = state.orderedItemIdsByThread[threadId] ?? []
  const existingIdSet = new Set(existingIds)
  const pageIds = page.items
    .map((item) => item.header.item_id)
    .filter((itemId) => !existingIdSet.has(itemId))
  const nextOrderedIds = [...pageIds, ...existingIds]
  const nextItems = nextOrderedIds.flatMap((itemId) => {
    const item =
      state.itemsById[codexItemKey(state, threadId, itemId)] ??
      page.items.find((candidate) => candidate.header.item_id === itemId)
    if (!item) return []
    return [isCodexTimelineItem(item) ? boundTimelineItem(item) : item]
  })
  return {
    ...state,
    itemsById: {
      ...state.itemsById,
      ...Object.fromEntries(
        page.items.map((item) => [
          codexItemKey(state, threadId, item.header.item_id),
          boundTimelineItem(item),
        ]),
      ),
    },
    orderedItemIdsByThread: {
      ...state.orderedItemIdsByThread,
      [threadId]: nextOrderedIds,
    },
    timelineItemsByThread: {
      ...state.timelineItemsByThread,
      [threadId]: freezeTimelineItems(nextItems),
    },
    timelineItemIndexByThread: {
      ...state.timelineItemIndexByThread,
      [threadId]: Object.fromEntries(
        nextItems.map((item, index) => [item.header.item_id, index]),
      ),
    },
    itemSourceById: {
      ...state.itemSourceById,
      ...Object.fromEntries(
        page.items.map((item) => [
          codexItemKey(state, threadId, item.header.item_id),
          CodexTimelineItemSource.Snapshot,
        ]),
      ),
    },
    historyCursorByThread: {
      ...state.historyCursorByThread,
      [threadId]: page.before_cursor,
    },
    historyRevisionByThread: {
      ...state.historyRevisionByThread,
      [threadId]: page.history_revision,
    },
  }
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
): Record<string, CodexTimelineRenderableItem> =>
  Object.fromEntries(
    Object.entries(state.itemsById).map(([itemId, item]) => [
      itemId,
      item.detail.kind !== 'evicted' &&
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
  ) as Record<string, CodexTimelineRenderableItem>

/** 终态会同时收敛多个 item，统一重建受影响线程的数组缓存。 */
const rebuildTimelineCacheForThread = (
  state: CodexSessionProjection,
  threadId: string,
): CodexSessionProjection => {
  const orderedIds = state.orderedItemIdsByThread[threadId] ?? []
  const timeline = orderedIds.flatMap((itemId) => {
    const item = state.itemsById[codexItemKey(state, threadId, itemId)]
    return item ? [item] : []
  })
  return {
    ...state,
    timelineItemsByThread: {
      ...state.timelineItemsByThread,
      [threadId]: freezeTimelineItems(timeline),
    },
    timelineItemIndexByThread: {
      ...state.timelineItemIndexByThread,
      [threadId]: Object.fromEntries(
        timeline.map((item, index) => [item.header.item_id, index]),
      ),
    },
  }
}

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
  const existing =
    state.itemsById[codexItemKey(state, detail.thread_id, detail.item_id)]
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
  const covered = event.header.thread_id
    ? state.snapshotSourceByThread[event.header.thread_id]
    : undefined
  if (
    covered &&
    event.header.source_epoch === covered.epoch &&
    event.header.source_seq != null &&
    event.header.source_seq <= covered.seq &&
    event.header.item_id &&
    covered.itemIds[event.header.item_id] &&
    [
      CodexRealtimeEventType.ItemDelta,
      CodexRealtimeEventType.ItemUpsert,
      CodexRealtimeEventType.TurnPlanUpdated,
      CodexRealtimeEventType.TurnDiffUpdated,
    ].includes(detail.kind)
  )
    return state
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
            connected: detail.connected,
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
      if (detail.history_status === CodexThreadHistoryStatus.NotRequested) {
        return {
          ...state,
          threadsById: { ...state.threadsById, [threadId]: mergedThread },
        }
      }
      const snapshotMetadata: CodexSessionProjection = {
        ...state,
        snapshotSourceByThread: {
          ...state.snapshotSourceByThread,
          ...(detail.source_epoch && detail.source_seq != null
            ? {
                [threadId]: {
                  epoch: detail.source_epoch,
                  seq: detail.source_seq,
                  itemIds: Object.fromEntries(
                    detail.items
                      .filter(
                        (item) =>
                          detail.covered_item_ids?.includes(
                            item.header.item_id,
                          ) ||
                          detail.turns.some(
                            (turn) =>
                              turn.turn_id === item.header.turn_id &&
                              turn.items_complete,
                          ),
                      )
                      .map((item) => [item.header.item_id, true as const]),
                  ),
                },
              }
            : {}),
        },
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
          [threadId]: detail.history_before_cursor,
        },
        historyRevisionByThread: {
          ...state.historyRevisionByThread,
          [threadId]: detail.history_revision,
        },
      }
      const fullyCoveredTerminalTurnIds = getFullyCoveredTerminalTurnIds(detail)
      let nextState: CodexSessionProjection = {
        ...snapshotMetadata,
        turnsById: {
          ...state.turnsById,
          ...Object.fromEntries(
            detail.turns.map((turn) => [turn.turn_id, turn]),
          ),
        },
      }
      // Use the ordinary upsert path first so official client_operation_id
      // acknowledgements also reconcile optimistic messages without a turn ID.
      for (const item of detail.items) {
        nextState = upsertItem(
          nextState,
          item,
          CodexTimelineItemSource.Snapshot,
        )
      }
      nextState = replaceFullyCoveredSnapshotTurns(
        nextState,
        threadId,
        detail.items,
        fullyCoveredTerminalTurnIds,
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
      const isCurrentTurn =
        !thread?.active_turn_id || thread.active_turn_id === turn.turn_id
      const terminalStatus =
        detail.kind === CodexRealtimeEventType.TurnFailed
          ? CodexThreadStatus.Failed
          : detail.kind === CodexRealtimeEventType.TurnInterrupted
            ? CodexThreadStatus.Interrupted
            : CodexThreadStatus.Idle
      const nextThread = thread
        ? {
            ...thread,
            // A late terminal event from an older turn must not clear the
            // currently active turn or regress its status.
            active_turn_id: isStarted
              ? turn.turn_id
              : isCurrentTurn
                ? null
                : thread.active_turn_id,
            status: isStarted
              ? CodexThreadStatus.Active
              : isCurrentTurn
                ? terminalStatus
                : thread.status,
          }
        : null
      const terminalFailed =
        detail.kind === CodexRealtimeEventType.TurnFailed ||
        detail.kind === CodexRealtimeEventType.TurnInterrupted
      const nextState: CodexSessionProjection = {
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
      return isStarted
        ? nextState
        : rebuildTimelineCacheForThread(nextState, turn.thread_id)
    }
    case CodexRealtimeEventType.ItemUpsert:
      return upsertItem(
        activityState,
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

/**
 * 同一网络批次中同一消息的相邻 delta 没有可观察中间态，因此可在纯 reducer 前合并。
 * 这只减少同一批次内的映射复制次数，绝不跨越 item、事件类型、barrier 或连接边界。
 */
const coalesceAdjacentItemDeltas = (
  events: readonly CodexRealtimeEvent[],
): CodexRealtimeEvent[] => {
  const reducedEvents: CodexRealtimeEvent[] = []
  for (const event of events) {
    const previous = reducedEvents.at(-1)
    if (
      previous?.header.source_seq == null &&
      event.header.source_seq == null &&
      previous?.detail.kind === CodexRealtimeEventType.ItemDelta &&
      event.detail.kind === CodexRealtimeEventType.ItemDelta &&
      previous.detail.item_id === event.detail.item_id &&
      previous.detail.thread_id === event.detail.thread_id &&
      previous.detail.turn_id === event.detail.turn_id
    ) {
      reducedEvents[reducedEvents.length - 1] = {
        ...previous,
        header: {
          ...previous.header,
          detail_kind: CodexRealtimeEventType.ItemDelta,
        },
        detail: {
          ...previous.detail,
          delta: `${previous.detail.delta}${event.detail.delta}`,
        },
      } as Extract<
        CodexRealtimeEvent,
        { detail: { kind: CodexRealtimeEventType.ItemDelta } }
      >
      continue
    }
    reducedEvents.push(event)
  }
  return reducedEvents
}

/**
 * 以服务端事件顺序折叠一个已验证批次。
 *
 * 该函数不自行去重或推断 cursor 连续性，二者属于 realtime connection store 的
 * generation/epoch 边界。纯 reducer 只保证批次投影与逐事件投影完全一致，调用方可
 * 以一次 Pinia 赋值提交结果，避免每个 delta 都触发视图刷新。
 */
export const reduceCodexRealtimeBatch = (
  state: CodexSessionProjection,
  events: readonly CodexRealtimeEvent[],
): CodexSessionProjection =>
  coalesceAdjacentItemDeltas(events).reduce(
    (nextState, event) => reduceCodexRealtimeEvent(nextState, event),
    state,
  )
