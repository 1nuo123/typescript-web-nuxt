import type { CodexTimelineItem } from './codex-item'
import type { CodexTurn } from './codex-turn'
import type { CodexApprovalPolicy, CodexSandboxMode } from './codex-host'

export interface CodexExecutionOptions {
  model?: string | null
  reasoning_effort?: string | null
  sandbox_mode: CodexSandboxMode
  approval_policy: CodexApprovalPolicy
}

export enum CodexThreadStatus {
  Idle = 'idle',
  Active = 'active',
  Interrupted = 'interrupted',
  Unknown = 'unknown',
  Archived = 'archived',
}

export enum CodexThreadHistoryStatus {
  Complete = 'complete',
  NotRequested = 'not_requested',
  OmittedTooLarge = 'omitted_too_large',
  NotAvailableYet = 'not_available_yet',
}

export interface CodexThread {
  thread_index_id: string
  host_id: string
  workspace_id: string
  owner_subject_id: string
  upstream_thread_id: string
  display_name: string | null
  model: string | null
  reasoning_effort: string | null
  status: CodexThreadStatus | string
  active_turn_id: string | null
  archived: boolean
  source_kind: string | null
  created_at: string | null
  updated_at: string
  last_synced_at: string
}

export interface CodexThreadCollection {
  items: CodexThread[]
}

export interface CodexThreadCreateRequest {
  workspace_id: string
  execution: CodexExecutionOptions
}

export interface CodexThreadAuthoritySnapshot {
  thread: CodexThread
  turns: CodexTurn[]
  items: CodexTimelineItem[]
  history_status: CodexThreadHistoryStatus
  next_history_cursor: string | null
}
