import type { CodexHost, CodexHostStatus } from './codex-host'
import type {
  CodexDiffSnapshot,
  CodexTimelineItem,
  CodexPlanStep,
} from './codex-item'
import type { CodexThread, CodexThreadHistoryStatus } from './codex-thread'
import type { CodexTurn } from './codex-turn'
import type { CodexWorkspace } from './codex-workspace'
import type { CodexApproval } from './codex-approval'

export const CODEX_REALTIME_SCHEMA_VERSION = '2.0'
export const CODEX_REALTIME_STREAM_EPOCH = 'codex-browser-stream-v2'

export enum CodexRealtimeEventType {
  ConnectionReady = 'connection.ready',
  ConnectionHeartbeat = 'connection.heartbeat',
  HostSnapshot = 'host.snapshot',
  HostStatusChanged = 'host.status_changed',
  WorkspaceSnapshot = 'workspace.snapshot',
  ThreadSnapshot = 'thread.snapshot',
  ThreadUpdated = 'thread.updated',
  TurnStarted = 'turn.started',
  TurnCompleted = 'turn.completed',
  TurnFailed = 'turn.failed',
  TurnInterrupted = 'turn.interrupted',
  TurnPlanUpdated = 'turn.plan_updated',
  TurnDiffUpdated = 'turn.diff_updated',
  ItemUpsert = 'item.upsert',
  ItemDelta = 'item.delta',
  ApprovalOpened = 'approval.opened',
  ApprovalResolved = 'approval.resolved',
  StreamGapDetected = 'stream.gap_detected',
  ProtocolWarning = 'protocol.warning',
}

export interface CodexConnectionReadyPayload {
  heartbeat_interval: number
  server_time: string
}

export interface CodexConnectionHeartbeatPayload {
  server_time: string
}

export interface CodexHostSnapshotPayload {
  hosts: CodexHost[]
}

export interface CodexHostStatusPayload {
  host_id: string
  status: CodexHostStatus
  last_seen_at?: string | null
}

export interface CodexWorkspaceSnapshotPayload {
  workspaces: CodexWorkspace[]
}

export interface CodexThreadSnapshotPayload {
  thread: CodexThread
  turns: CodexTurn[]
  items: CodexTimelineItem[]
  history_status: CodexThreadHistoryStatus
  next_history_cursor?: string | null
  append_history?: boolean
}

export interface CodexThreadUpdatedPayload {
  thread: Pick<CodexThread, 'host_id' | 'workspace_id' | 'upstream_thread_id'> &
    Partial<CodexThread>
}

export interface CodexTurnEventPayload {
  turn: CodexTurn
}

export interface CodexPlanUpdatedPayload {
  item_id: string
  thread_id: string
  turn_id: string | null
  explanation?: string
  steps: CodexPlanStep[]
}

export interface CodexDiffUpdatedPayload {
  item_id: string
  thread_id: string
  turn_id: string | null
  diff: CodexDiffSnapshot
}

export interface CodexItemUpsertPayload {
  item: CodexTimelineItem
}

export interface CodexItemDeltaPayload {
  item_id: string
  thread_id: string
  turn_id: string | null
  delta: string
}

export interface CodexGapPayload {
  reason: string
  snapshot_required?: boolean
}

export interface CodexProtocolWarningPayload {
  warning: string
}

export interface CodexApprovalEventPayload {
  approval: CodexApproval
}

export interface CodexRealtimePayloadMap {
  [CodexRealtimeEventType.ConnectionReady]: CodexConnectionReadyPayload
  [CodexRealtimeEventType.ConnectionHeartbeat]: CodexConnectionHeartbeatPayload
  [CodexRealtimeEventType.HostSnapshot]: CodexHostSnapshotPayload
  [CodexRealtimeEventType.HostStatusChanged]: CodexHostStatusPayload
  [CodexRealtimeEventType.WorkspaceSnapshot]: CodexWorkspaceSnapshotPayload
  [CodexRealtimeEventType.ThreadSnapshot]: CodexThreadSnapshotPayload
  [CodexRealtimeEventType.ThreadUpdated]: CodexThreadUpdatedPayload
  [CodexRealtimeEventType.TurnStarted]: CodexTurnEventPayload
  [CodexRealtimeEventType.TurnCompleted]: CodexTurnEventPayload
  [CodexRealtimeEventType.TurnFailed]: CodexTurnEventPayload
  [CodexRealtimeEventType.TurnInterrupted]: CodexTurnEventPayload
  [CodexRealtimeEventType.TurnPlanUpdated]: CodexPlanUpdatedPayload
  [CodexRealtimeEventType.TurnDiffUpdated]: CodexDiffUpdatedPayload
  [CodexRealtimeEventType.ItemUpsert]: CodexItemUpsertPayload
  [CodexRealtimeEventType.ItemDelta]: CodexItemDeltaPayload
  [CodexRealtimeEventType.ApprovalOpened]: CodexApprovalEventPayload
  [CodexRealtimeEventType.ApprovalResolved]: CodexApprovalEventPayload
  [CodexRealtimeEventType.StreamGapDetected]: CodexGapPayload
  [CodexRealtimeEventType.ProtocolWarning]: CodexProtocolWarningPayload
}

export type CodexRealtimeEvent = {
  [TType in CodexRealtimeEventType]: {
    kind: 'codex_realtime_event'
    schema_version: typeof CODEX_REALTIME_SCHEMA_VERSION
    stream_epoch: string
    cursor?: string | null
    event_id: string
    host_id: string
    workspace_id?: string | null
    thread_id?: string | null
    turn_id?: string | null
    item_id?: string | null
    type: TType
    payload: CodexRealtimePayloadMap[TType]
  }
}[CodexRealtimeEventType]

export enum CodexRealtimeConnectionStatus {
  Idle = 'idle',
  Connecting = 'connecting',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
  Offline = 'offline',
  Incompatible = 'incompatible',
  Error = 'error',
}

export enum CodexRealtimeApplyResult {
  Applied = 'applied',
  Duplicate = 'duplicate',
  Gap = 'gap',
  NewStreamEpoch = 'new_stream_epoch',
}

export interface CodexRealtimeTicket {
  ticket: string
  expires_at?: string
}
