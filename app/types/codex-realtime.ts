import type { CodexHost, CodexHostStatus } from './codex-host'
import type {
  CodexDiffSnapshot,
  CodexPlanStep,
  CodexTimelineItem,
} from './codex-item'
import type { CodexThread, CodexThreadHistoryStatus } from './codex-thread'
import type { CodexTurn, CodexTurnRuntime } from './codex-turn'
import type { CodexWorkspace } from './codex-workspace'
import type { CodexApproval } from './codex-approval'

export const CODEX_REALTIME_SCHEMA_VERSION = '2.0'
export const CODEX_REALTIME_STREAM_EPOCH = 'codex-browser-stream-v2'
export const CODEX_REALTIME_BATCH_PROTOCOL_VERSION = 2

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

export interface CodexRealtimeEventHeader {
  source_epoch?: string | null
  source_seq?: number | null
  kind: 'codex_realtime_event'
  schema_version: typeof CODEX_REALTIME_SCHEMA_VERSION
  stream_epoch: string
  cursor?: string | null
  event_id: string
  occurred_at: string
  host_id: string
  workspace_id?: string | null
  thread_id?: string | null
  turn_id?: string | null
  item_id?: string | null
  detail_kind: CodexRealtimeEventType
}

interface CodexRealtimeDetailBase {
  schema_version: typeof CODEX_REALTIME_SCHEMA_VERSION
}

export interface CodexConnectionReadyDetail extends CodexRealtimeDetailBase {
  kind: CodexRealtimeEventType.ConnectionReady
  heartbeat_interval: number
  server_time: string
}

export interface CodexConnectionHeartbeatDetail extends CodexRealtimeDetailBase {
  kind: CodexRealtimeEventType.ConnectionHeartbeat
  server_time: string
}

export interface CodexHostSnapshotDetail extends CodexRealtimeDetailBase {
  kind: CodexRealtimeEventType.HostSnapshot
  hosts: CodexHost[]
}

export interface CodexHostStatusDetail extends CodexRealtimeDetailBase {
  kind: CodexRealtimeEventType.HostStatusChanged
  host_id: string
  status: CodexHostStatus
  last_seen_at?: string | null
}

export interface CodexWorkspaceSnapshotDetail extends CodexRealtimeDetailBase {
  kind: CodexRealtimeEventType.WorkspaceSnapshot
  workspaces: CodexWorkspace[]
}

export interface CodexThreadSnapshotDetail extends CodexRealtimeDetailBase {
  source_epoch?: string | null
  source_seq?: number
  kind: CodexRealtimeEventType.ThreadSnapshot
  thread: CodexThread
  turns: CodexTurn[]
  items: CodexTimelineItem[]
  history_status: CodexThreadHistoryStatus
  history_before_cursor: string | null
  history_has_more: boolean
  history_revision: string | null
}

export interface CodexThreadUpdatedDetail extends CodexRealtimeDetailBase {
  kind: CodexRealtimeEventType.ThreadUpdated
  thread: Pick<CodexThread, 'host_id' | 'workspace_id' | 'upstream_thread_id'> &
    Partial<CodexThread>
}

export interface CodexTurnStartedDetail extends CodexRealtimeDetailBase {
  kind: CodexRealtimeEventType.TurnStarted
  turn: CodexTurn
}

export interface CodexTurnCompletedDetail extends CodexRealtimeDetailBase {
  kind: CodexRealtimeEventType.TurnCompleted
  turn: CodexTurn
}

export interface CodexTurnFailedDetail extends CodexRealtimeDetailBase {
  kind: CodexRealtimeEventType.TurnFailed
  turn: CodexTurn
}

export interface CodexTurnInterruptedDetail extends CodexRealtimeDetailBase {
  kind: CodexRealtimeEventType.TurnInterrupted
  turn: CodexTurn
}

export type CodexTurnEventDetail =
  | CodexTurnStartedDetail
  | CodexTurnCompletedDetail
  | CodexTurnFailedDetail
  | CodexTurnInterruptedDetail

export interface CodexPlanUpdatedDetail extends CodexRealtimeDetailBase {
  kind: CodexRealtimeEventType.TurnPlanUpdated
  item_id: string
  thread_id: string
  turn_id: string | null
  explanation: string
  steps: CodexPlanStep[]
}

export interface CodexDiffUpdatedDetail extends CodexRealtimeDetailBase {
  kind: CodexRealtimeEventType.TurnDiffUpdated
  item_id: string
  thread_id: string
  turn_id: string | null
  diff: CodexDiffSnapshot
}

export interface CodexItemUpsertDetail extends CodexRealtimeDetailBase {
  kind: CodexRealtimeEventType.ItemUpsert
  item: CodexTimelineItem
}

export interface CodexItemDeltaDetail extends CodexRealtimeDetailBase {
  kind: CodexRealtimeEventType.ItemDelta
  item_id: string
  thread_id: string
  turn_id: string | null
  delta: string
}

export interface CodexGapDetail extends CodexRealtimeDetailBase {
  kind: CodexRealtimeEventType.StreamGapDetected
  reason: string
  snapshot_required: boolean
  server_time?: string | null
}

export interface CodexProtocolWarningDetail extends CodexRealtimeDetailBase {
  kind: CodexRealtimeEventType.ProtocolWarning
  warning: string
}

export interface CodexApprovalOpenedDetail extends CodexRealtimeDetailBase {
  kind: CodexRealtimeEventType.ApprovalOpened
  approval: CodexApproval
}

export interface CodexApprovalResolvedDetail extends CodexRealtimeDetailBase {
  kind: CodexRealtimeEventType.ApprovalResolved
  approval: CodexApproval
}

export type CodexApprovalEventDetail =
  | CodexApprovalOpenedDetail
  | CodexApprovalResolvedDetail

export type CodexRealtimeEventDetail =
  | CodexConnectionReadyDetail
  | CodexConnectionHeartbeatDetail
  | CodexHostSnapshotDetail
  | CodexHostStatusDetail
  | CodexWorkspaceSnapshotDetail
  | CodexThreadSnapshotDetail
  | CodexThreadUpdatedDetail
  | CodexTurnEventDetail
  | CodexPlanUpdatedDetail
  | CodexDiffUpdatedDetail
  | CodexItemUpsertDetail
  | CodexItemDeltaDetail
  | CodexGapDetail
  | CodexProtocolWarningDetail
  | CodexApprovalEventDetail

export type CodexRealtimeEvent = {
  [TKind in CodexRealtimeEventType]: {
    header: CodexRealtimeEventHeader & { detail_kind: TKind }
    detail: Extract<CodexRealtimeEventDetail, { kind: TKind }>
  }
}[CodexRealtimeEventType]

export enum CodexRealtimeConnectionStatus {
  Idle = 'idle',
  Connecting = 'connecting',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
  Resyncing = 'resyncing',
  AuthBlocked = 'auth_blocked',
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

/** 跨网络边界的有序事件批次；同一批只允许一个 stream epoch。 */
export interface CodexRealtimeBatch {
  protocol_version: typeof CODEX_REALTIME_BATCH_PROTOCOL_VERSION
  stream_epoch: string
  first_cursor: string | null
  last_cursor: string | null
  barrier: boolean
  events: CodexRealtimeEvent[]
}

/** 权威恢复快照，应用后只能重放 snapshot_cursor 之后的事件。 */
export interface CodexAuthoritySnapshot {
  stream_epoch: string
  snapshot_cursor: string
  projection_revision: string
  thread: CodexThread
  timeline_items: CodexTimelineItem[]
  turns: CodexTurnRuntime[]
  approvals: CodexApproval[]
}
