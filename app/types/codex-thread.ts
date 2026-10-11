import type { CodexTimelineItem } from './codex-item'
import type { CodexTurn, CodexTurnRuntime } from './codex-turn'
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
  NotMaterialized = 'not_materialized',
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
  /** 服务端权威运行态；无活动 turn 时明确返回 null。 */
  turn_runtime: CodexTurnRuntime | null
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
  source_epoch?: string | null
  source_seq?: number
  thread: CodexThread
  turns: CodexTurn[]
  items: CodexTimelineItem[]
  history_status: CodexThreadHistoryStatus
  history_before_cursor: string | null
  history_has_more: boolean
  history_revision: string | null
}

/** 按服务端签名边界向前读取的一页历史，不包含线程控制面元数据。 */
export interface CodexThreadHistoryPage {
  items: CodexTimelineItem[]
  before_cursor: string | null
  has_more: boolean
  history_revision: string
}

/** 仅按稳定 item ID 恢复当前标签页已回收正文的权威响应。 */
export interface CodexThreadHistoryItemReload {
  items: CodexTimelineItem[]
  missing_item_ids: string[]
}
