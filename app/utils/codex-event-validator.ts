import {
  CODEX_REALTIME_SCHEMA_VERSION,
  CodexRealtimeEventType,
  type CodexRealtimeEvent,
} from '../types/codex-realtime'
import { CodexThreadHistoryStatus } from '../types/codex-thread'
import { CodexHostStatus } from '../types/codex-host'

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

const requirePayloadRecord = (
  value: Record<string, unknown>,
): Record<string, unknown> => {
  if (!isRecord(value.payload)) {
    throw new CodexRealtimeContractError('Codex实时事件payload必须是对象。')
  }
  return value.payload
}

const requirePayloadString = (
  payload: Record<string, unknown>,
  key: string,
): void => {
  requireString(payload, key)
}

const requirePayloadArray = (
  payload: Record<string, unknown>,
  key: string,
): void => {
  if (!Array.isArray(payload[key])) {
    throw new CodexRealtimeContractError(
      `Codex实时事件payload.${key}必须是数组。`,
    )
  }
}

const validatePayload = (
  eventType: CodexRealtimeEventType,
  payload: Record<string, unknown>,
): void => {
  switch (eventType) {
    case CodexRealtimeEventType.ConnectionReady:
      if (
        typeof payload.heartbeat_interval !== 'number' ||
        payload.heartbeat_interval <= 0
      ) {
        throw new CodexRealtimeContractError(
          'Codex connection.ready缺少有效heartbeat_interval。',
        )
      }
      requirePayloadString(payload, 'server_time')
      return
    case CodexRealtimeEventType.ConnectionHeartbeat:
      requirePayloadString(payload, 'server_time')
      return
    case CodexRealtimeEventType.HostSnapshot:
      requirePayloadArray(payload, 'hosts')
      return
    case CodexRealtimeEventType.WorkspaceSnapshot:
      requirePayloadArray(payload, 'workspaces')
      return
    case CodexRealtimeEventType.ThreadSnapshot:
      if (!isRecord(payload.thread)) {
        throw new CodexRealtimeContractError('thread.snapshot缺少thread。')
      }
      requirePayloadArray(payload, 'turns')
      requirePayloadArray(payload, 'items')
      if (
        !Object.values(CodexThreadHistoryStatus).includes(
          payload.history_status as CodexThreadHistoryStatus,
        )
      ) {
        throw new CodexRealtimeContractError(
          'thread.snapshot缺少有效history_status。',
        )
      }
      return
    case CodexRealtimeEventType.ThreadUpdated:
    case CodexRealtimeEventType.TurnStarted:
    case CodexRealtimeEventType.TurnCompleted:
    case CodexRealtimeEventType.TurnFailed:
    case CodexRealtimeEventType.TurnInterrupted:
    case CodexRealtimeEventType.ItemUpsert:
      if (
        !isRecord(payload.thread) &&
        !isRecord(payload.turn) &&
        !isRecord(payload.item)
      ) {
        throw new CodexRealtimeContractError(`${eventType}缺少实体payload。`)
      }
      return
    case CodexRealtimeEventType.ApprovalOpened:
    case CodexRealtimeEventType.ApprovalResolved:
      if (!isRecord(payload.approval)) {
        throw new CodexRealtimeContractError(`${eventType}缺少approval。`)
      }
      if (!isRecord(payload.approval.display_summary)) {
        throw new CodexRealtimeContractError(
          `${eventType}缺少清洗后的展示摘要。`,
        )
      }
      return
    case CodexRealtimeEventType.HostStatusChanged:
      requirePayloadString(payload, 'host_id')
      requirePayloadString(payload, 'status')
      if (
        !Object.values(CodexHostStatus).includes(
          payload.status as CodexHostStatus,
        )
      ) {
        throw new CodexRealtimeContractError(
          'host.status_changed缺少有效status。',
        )
      }
      return
    case CodexRealtimeEventType.TurnPlanUpdated:
      requirePayloadString(payload, 'item_id')
      requirePayloadString(payload, 'thread_id')
      requirePayloadArray(payload, 'steps')
      return
    case CodexRealtimeEventType.TurnDiffUpdated:
      requirePayloadString(payload, 'item_id')
      requirePayloadString(payload, 'thread_id')
      if (!isRecord(payload.diff) || !Array.isArray(payload.diff.files)) {
        throw new CodexRealtimeContractError(
          'turn.diff_updated缺少结构化diff。',
        )
      }
      return
    case CodexRealtimeEventType.ItemDelta:
      requirePayloadString(payload, 'item_id')
      requirePayloadString(payload, 'thread_id')
      if (typeof payload.delta !== 'string') {
        throw new CodexRealtimeContractError('item.delta缺少字符串delta。')
      }
      return
    case CodexRealtimeEventType.StreamGapDetected:
      requirePayloadString(payload, 'reason')
      return
    case CodexRealtimeEventType.ProtocolWarning:
      requirePayloadString(payload, 'warning')
  }
}

export const validateCodexRealtimeEvent = (
  value: unknown,
): CodexRealtimeEvent => {
  if (!isRecord(value)) {
    throw new CodexRealtimeContractError('Codex实时事件必须是对象。')
  }
  if (value.kind !== 'codex_realtime_event') {
    throw new CodexRealtimeContractError('Codex实时事件kind不兼容。')
  }
  if (value.schema_version !== CODEX_REALTIME_SCHEMA_VERSION) {
    throw new CodexRealtimeContractError('Codex实时事件schema_version不兼容。')
  }
  const eventType = requireString(value, 'type')
  if (
    !Object.values(CodexRealtimeEventType).includes(
      eventType as CodexRealtimeEventType,
    )
  ) {
    throw new CodexRealtimeContractError(
      `Codex实时事件类型不受支持：${eventType}。`,
    )
  }
  requireString(value, 'stream_epoch')
  requireString(value, 'event_id')
  requireString(value, 'host_id')
  if (
    value.cursor !== undefined &&
    value.cursor !== null &&
    typeof value.cursor !== 'string'
  ) {
    throw new CodexRealtimeContractError(
      'Codex实时事件cursor必须是字符串或null。',
    )
  }
  const payload = requirePayloadRecord(value)
  validatePayload(eventType as CodexRealtimeEventType, payload)
  return value as unknown as CodexRealtimeEvent
}
