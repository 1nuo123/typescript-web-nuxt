import {
  CODEX_REALTIME_BATCH_PROTOCOL_VERSION,
  CODEX_REALTIME_SCHEMA_VERSION,
  CodexRealtimeEventType,
  type CodexRealtimeBatch,
  type CodexRealtimeEvent,
} from '../types/codex-realtime'
import { CodexThreadHistoryStatus } from '../types/codex-thread'
import { CodexHostStatus } from '../types/codex-host'
import {
  CodexProductContractError,
  normalizeCodexApproval,
  normalizeCodexDiff,
  normalizeCodexTimelineItem,
} from './codex-contract-normalizer'

const EVENT_KEYS = new Set(['header', 'detail'])
const BATCH_KEYS = new Set([
  'protocol_version',
  'stream_epoch',
  'first_cursor',
  'last_cursor',
  'barrier',
  'events',
])
const BATCH_BARRIER_EVENT_TYPES = new Set<CodexRealtimeEventType>([
  CodexRealtimeEventType.TurnCompleted,
  CodexRealtimeEventType.TurnFailed,
  CodexRealtimeEventType.TurnInterrupted,
  CodexRealtimeEventType.ApprovalOpened,
  CodexRealtimeEventType.ApprovalResolved,
  CodexRealtimeEventType.StreamGapDetected,
  CodexRealtimeEventType.ProtocolWarning,
])
const HEADER_KEYS = new Set([
  'source_epoch',
  'source_seq',
  'kind',
  'schema_version',
  'stream_epoch',
  'cursor',
  'event_id',
  'occurred_at',
  'host_id',
  'workspace_id',
  'thread_id',
  'turn_id',
  'item_id',
  'detail_kind',
])

export class CodexRealtimeContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CodexRealtimeContractError'
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const requireString = (value: Record<string, unknown>, key: string): string => {
  const candidate = value[key]
  if (typeof candidate !== 'string' || candidate.length === 0) {
    throw new CodexRealtimeContractError(`Codex实时事件缺少有效${key}。`)
  }
  return candidate
}

const requireTimestamp = (
  value: Record<string, unknown>,
  key: string,
): string => {
  const timestamp = requireString(value, key)
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new CodexRealtimeContractError(`Codex实时事件${key}必须是有效时间。`)
  }
  return timestamp
}

const requireArray = (value: Record<string, unknown>, key: string): void => {
  if (!Array.isArray(value[key])) {
    throw new CodexRealtimeContractError(
      `Codex实时事件detail.${key}必须是数组。`,
    )
  }
}

const rejectUnknownKeys = (
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
): void => {
  const unknown = Object.keys(value).find((key) => !allowed.has(key))
  if (unknown) {
    throw new CodexRealtimeContractError(`${path}包含未知字段${unknown}。`)
  }
}

const detailKeys = (eventType: CodexRealtimeEventType): ReadonlySet<string> => {
  const shared = ['kind', 'schema_version']
  switch (eventType) {
    case CodexRealtimeEventType.ConnectionReady:
      return new Set([...shared, 'heartbeat_interval', 'server_time'])
    case CodexRealtimeEventType.ConnectionHeartbeat:
      return new Set([...shared, 'server_time'])
    case CodexRealtimeEventType.HostSnapshot:
      return new Set([...shared, 'hosts'])
    case CodexRealtimeEventType.HostStatusChanged:
      return new Set([...shared, 'host_id', 'status', 'last_seen_at'])
    case CodexRealtimeEventType.WorkspaceSnapshot:
      return new Set([...shared, 'workspaces'])
    case CodexRealtimeEventType.ThreadSnapshot:
      return new Set([
        ...shared,
        'thread',
        'turns',
        'items',
        'history_status',
        'history_before_cursor',
        'history_has_more',
        'history_revision',
        'source_epoch',
        'source_seq',
      ])
    case CodexRealtimeEventType.ThreadUpdated:
      return new Set([...shared, 'thread'])
    case CodexRealtimeEventType.TurnStarted:
    case CodexRealtimeEventType.TurnCompleted:
    case CodexRealtimeEventType.TurnFailed:
    case CodexRealtimeEventType.TurnInterrupted:
      return new Set([...shared, 'turn'])
    case CodexRealtimeEventType.TurnPlanUpdated:
      return new Set([
        ...shared,
        'item_id',
        'thread_id',
        'turn_id',
        'explanation',
        'steps',
      ])
    case CodexRealtimeEventType.TurnDiffUpdated:
      return new Set([...shared, 'item_id', 'thread_id', 'turn_id', 'diff'])
    case CodexRealtimeEventType.ItemUpsert:
      return new Set([...shared, 'item'])
    case CodexRealtimeEventType.ItemDelta:
      return new Set([...shared, 'item_id', 'thread_id', 'turn_id', 'delta'])
    case CodexRealtimeEventType.ApprovalOpened:
    case CodexRealtimeEventType.ApprovalResolved:
      return new Set([...shared, 'approval'])
    case CodexRealtimeEventType.StreamGapDetected:
      return new Set([...shared, 'reason', 'snapshot_required', 'server_time'])
    case CodexRealtimeEventType.ProtocolWarning:
      return new Set([...shared, 'warning'])
  }
}

const validateDetail = (
  eventType: CodexRealtimeEventType,
  detail: Record<string, unknown>,
): void => {
  rejectUnknownKeys(detail, detailKeys(eventType), 'Codex实时事件detail')
  switch (eventType) {
    case CodexRealtimeEventType.ConnectionReady:
      if (
        typeof detail.heartbeat_interval !== 'number' ||
        detail.heartbeat_interval <= 0
      ) {
        throw new CodexRealtimeContractError(
          'Codex connection.ready缺少有效heartbeat_interval。',
        )
      }
      requireString(detail, 'server_time')
      return
    case CodexRealtimeEventType.ConnectionHeartbeat:
      requireString(detail, 'server_time')
      return
    case CodexRealtimeEventType.HostSnapshot:
      requireArray(detail, 'hosts')
      return
    case CodexRealtimeEventType.WorkspaceSnapshot:
      requireArray(detail, 'workspaces')
      return
    case CodexRealtimeEventType.ThreadSnapshot:
      if (!isRecord(detail.thread)) {
        throw new CodexRealtimeContractError('thread.snapshot缺少thread。')
      }
      requireArray(detail, 'turns')
      requireArray(detail, 'items')
      if (
        !Object.values(CodexThreadHistoryStatus).includes(
          detail.history_status as CodexThreadHistoryStatus,
        )
      ) {
        throw new CodexRealtimeContractError(
          'thread.snapshot缺少有效history_status。',
        )
      }
      return
    case CodexRealtimeEventType.ThreadUpdated:
      if (!isRecord(detail.thread)) {
        throw new CodexRealtimeContractError('thread.updated缺少thread。')
      }
      return
    case CodexRealtimeEventType.TurnStarted:
    case CodexRealtimeEventType.TurnCompleted:
    case CodexRealtimeEventType.TurnFailed:
    case CodexRealtimeEventType.TurnInterrupted:
      if (!isRecord(detail.turn)) {
        throw new CodexRealtimeContractError(`${eventType}缺少turn。`)
      }
      return
    case CodexRealtimeEventType.ItemUpsert:
      if (!isRecord(detail.item)) {
        throw new CodexRealtimeContractError('item.upsert缺少item。')
      }
      return
    case CodexRealtimeEventType.ApprovalOpened:
    case CodexRealtimeEventType.ApprovalResolved:
      if (!isRecord(detail.approval)) {
        throw new CodexRealtimeContractError(`${eventType}缺少approval。`)
      }
      if (!isRecord(detail.approval.display_summary)) {
        throw new CodexRealtimeContractError(
          `${eventType}缺少清洗后的展示摘要。`,
        )
      }
      return
    case CodexRealtimeEventType.HostStatusChanged:
      requireString(detail, 'host_id')
      requireString(detail, 'status')
      if (
        !Object.values(CodexHostStatus).includes(
          detail.status as CodexHostStatus,
        )
      ) {
        throw new CodexRealtimeContractError(
          'host.status_changed缺少有效status。',
        )
      }
      return
    case CodexRealtimeEventType.TurnPlanUpdated:
      requireString(detail, 'item_id')
      requireString(detail, 'thread_id')
      requireArray(detail, 'steps')
      return
    case CodexRealtimeEventType.TurnDiffUpdated:
      requireString(detail, 'item_id')
      requireString(detail, 'thread_id')
      if (!isRecord(detail.diff) || !Array.isArray(detail.diff.files)) {
        throw new CodexRealtimeContractError(
          'turn.diff_updated缺少结构化diff。',
        )
      }
      return
    case CodexRealtimeEventType.ItemDelta:
      requireString(detail, 'item_id')
      requireString(detail, 'thread_id')
      if (typeof detail.delta !== 'string') {
        throw new CodexRealtimeContractError('item.delta缺少字符串delta。')
      }
      return
    case CodexRealtimeEventType.StreamGapDetected:
      requireString(detail, 'reason')
      return
    case CodexRealtimeEventType.ProtocolWarning:
      requireString(detail, 'warning')
  }
}

const normalizeDetail = (
  eventType: CodexRealtimeEventType,
  detail: Record<string, unknown>,
): Record<string, unknown> => {
  switch (eventType) {
    case CodexRealtimeEventType.ThreadSnapshot:
      return {
        ...detail,
        items: (detail.items as unknown[]).map((item, index) =>
          normalizeCodexTimelineItem(item, `thread.snapshot.items[${index}]`),
        ),
      }
    case CodexRealtimeEventType.ItemUpsert:
      return {
        ...detail,
        item: normalizeCodexTimelineItem(detail.item, 'item.upsert.item'),
      }
    case CodexRealtimeEventType.TurnDiffUpdated:
      return {
        ...detail,
        diff: normalizeCodexDiff(detail.diff, 'turn.diff_updated.diff'),
      }
    case CodexRealtimeEventType.ApprovalOpened:
    case CodexRealtimeEventType.ApprovalResolved:
      return {
        ...detail,
        approval: normalizeCodexApproval(detail.approval),
      }
    default:
      return detail
  }
}

export const validateCodexRealtimeEvent = (
  value: unknown,
): CodexRealtimeEvent => {
  if (!isRecord(value)) {
    throw new CodexRealtimeContractError('Codex实时事件必须是对象。')
  }
  rejectUnknownKeys(value, EVENT_KEYS, 'Codex实时事件')
  if (!isRecord(value.header) || !isRecord(value.detail)) {
    throw new CodexRealtimeContractError(
      'Codex实时事件必须包含header和detail。',
    )
  }
  const header = value.header
  const detail = value.detail
  rejectUnknownKeys(header, HEADER_KEYS, 'Codex实时事件header')
  if (header.kind !== 'codex_realtime_event') {
    throw new CodexRealtimeContractError('Codex实时事件kind不兼容。')
  }
  if (header.schema_version !== CODEX_REALTIME_SCHEMA_VERSION) {
    throw new CodexRealtimeContractError('Codex实时事件schema_version不兼容。')
  }
  const eventType = requireString(header, 'detail_kind')
  if (
    !Object.values(CodexRealtimeEventType).includes(
      eventType as CodexRealtimeEventType,
    )
  ) {
    throw new CodexRealtimeContractError(
      `Codex实时事件类型不受支持：${eventType}。`,
    )
  }
  if (header.source_epoch != null && typeof header.source_epoch !== 'string') throw new CodexRealtimeContractError('事件来源代次无效。')
  if (header.source_seq != null && (!Number.isSafeInteger(header.source_seq) || Number(header.source_seq) < 0)) throw new CodexRealtimeContractError('事件来源序号无效。')
  requireString(header, 'stream_epoch')
  requireString(header, 'event_id')
  requireTimestamp(header, 'occurred_at')
  requireString(header, 'host_id')
  if (
    header.cursor !== undefined &&
    header.cursor !== null &&
    typeof header.cursor !== 'string'
  ) {
    throw new CodexRealtimeContractError(
      'Codex实时事件cursor必须是字符串或null。',
    )
  }
  if (detail.kind !== eventType) {
    throw new CodexRealtimeContractError('Codex实时事件头与扩展类型不一致。')
  }
  if (detail.schema_version !== CODEX_REALTIME_SCHEMA_VERSION) {
    throw new CodexRealtimeContractError('Codex实时事件头与扩展版本不一致。')
  }
  validateDetail(eventType as CodexRealtimeEventType, detail)
  try {
    return {
      header,
      detail: normalizeDetail(eventType as CodexRealtimeEventType, detail),
    } as unknown as CodexRealtimeEvent
  } catch (error) {
    if (error instanceof CodexProductContractError) {
      throw new CodexRealtimeContractError(
        `Codex实时事件扩展无效：${error.message}`,
      )
    }
    throw error
  }
}

/**
 * 校验批次边界与事件 epoch；cursor 是不透明值，因此只验证首尾一致性。
 */
export const validateCodexRealtimeBatch = (
  value: unknown,
): CodexRealtimeBatch => {
  if (!isRecord(value)) {
    throw new CodexRealtimeContractError('Codex实时批次必须是对象。')
  }
  rejectUnknownKeys(value, BATCH_KEYS, 'Codex实时批次')
  if (value.protocol_version !== CODEX_REALTIME_BATCH_PROTOCOL_VERSION) {
    throw new CodexRealtimeContractError('Codex实时批次协议版本不兼容。')
  }
  const streamEpoch = requireString(value, 'stream_epoch')
  if (typeof value.barrier !== 'boolean') {
    throw new CodexRealtimeContractError('Codex实时批次barrier必须是布尔值。')
  }
  if (!Array.isArray(value.events) || value.events.length === 0) {
    throw new CodexRealtimeContractError('Codex实时批次必须包含事件。')
  }
  if (value.events.length > 64) {
    throw new CodexRealtimeContractError('Codex实时批次事件数超过上限。')
  }
  const events = value.events.map(validateCodexRealtimeEvent)
  if (events.some((event) => event.header.stream_epoch !== streamEpoch)) {
    throw new CodexRealtimeContractError('Codex实时批次包含跨epoch事件。')
  }
  const firstCursor = events[0]?.header.cursor ?? null
  const lastCursor = events.at(-1)?.header.cursor ?? null
  if (value.first_cursor !== firstCursor || value.last_cursor !== lastCursor) {
    throw new CodexRealtimeContractError('Codex实时批次首尾cursor不匹配。')
  }
  if (
    value.barrier &&
    events.some(
      (event) => !BATCH_BARRIER_EVENT_TYPES.has(event.header.detail_kind),
    )
  ) {
    throw new CodexRealtimeContractError(
      'Codex实时屏障批次只能包含终态、审批、错误或恢复事件。',
    )
  }
  return {
    protocol_version: CODEX_REALTIME_BATCH_PROTOCOL_VERSION,
    stream_epoch: streamEpoch,
    first_cursor: firstCursor,
    last_cursor: lastCursor,
    barrier: value.barrier,
    events,
  }
}
