import type { CodexExecutionOptions } from './codex-thread'

export enum CodexTurnStatus {
  Pending = 'pending',
  Active = 'active',
  Completed = 'completed',
  Failed = 'failed',
  Interrupted = 'interrupted',
}

/** 服务端权威 turn 运行阶段，不能由 socket 到达时间推断。 */
export enum CodexTurnPhase {
  Submitted = 'submitted',
  Starting = 'starting',
  Running = 'running',
  AwaitingApproval = 'awaiting_approval',
  Stalled = 'stalled',
  Completed = 'completed',
  Failed = 'failed',
  Interrupted = 'interrupted',
}

/** 快照恢复和状态页共用的 turn 运行时投影。 */
export interface CodexTurnRuntime {
  turn_id: string
  thread_id: string
  phase: CodexTurnPhase
  last_activity_at: string
  stalled_reason: string | null
  lease_generation: number
  lease_expires_at: string | null
}

export interface CodexTurn {
  turn_id: string
  thread_id: string
  status: CodexTurnStatus | string
  started_at?: string | null
  completed_at?: string | null
  error_message?: string | null
}

export interface CodexOperationAccepted {
  operation_id: string
  command_id: string
  /** 回显的客户端操作身份，用于与本地乐观消息对账。 */
  client_operation_id: string | null
  status: string
  replayed: boolean
}

export interface CodexTurnMessageRequest {
  /** 必须与 Idempotency-Key 相同，并映射到 App Server clientUserMessageId。 */
  client_operation_id: string
  message: string
  execution: CodexExecutionOptions
}
