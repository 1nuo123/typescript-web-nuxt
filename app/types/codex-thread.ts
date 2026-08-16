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
  Failed = 'failed',
  Unknown = 'unknown',
  Archived = 'archived',
}

export enum CodexThreadTitleSource {
  Manual = 'manual',
  AppServer = 'app_server',
  FirstUserMessage = 'first_user_message',
  NewConversation = 'new_conversation',
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
  display_name: string
  title_source: CodexThreadTitleSource
  model: string | null
  model_provider: string | null
  reasoning_effort: string | null
  status: CodexThreadStatus
  active_turn_id: string | null
  archived: boolean
  is_pinned: boolean
  source_kind: string | null
  created_at: string
  recency_at: string
  updated_at: string
  last_synced_at: string
}

export interface CodexThreadCollection {
  items: CodexThread[]
  next_cursor: string | null
}

export interface CodexConversationListQuery {
  workspace_id?: string | null
  archived?: boolean
  search_term?: string | null
  cursor?: string | null
  limit?: number
}

export interface CodexConversationRenameRequest {
  display_name: string
}

export interface CodexConversationPinRequest {
  is_pinned: boolean
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
