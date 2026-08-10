import type { CodexExecutionOptions } from './codex-thread'

export enum CodexTurnStatus {
  Pending = 'pending',
  Active = 'active',
  Completed = 'completed',
  Failed = 'failed',
  Interrupted = 'interrupted',
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
  status: string
  replayed: boolean
}

export interface CodexTurnMessageRequest {
  message: string
  execution: CodexExecutionOptions
}
