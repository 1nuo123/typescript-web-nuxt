import type { CodexContentDescriptor } from './codex-content'
export const CODEX_TIMELINE_ITEM_SCHEMA_VERSION = '1.0'

export enum CodexTimelineItemKind {
  UserMessage = 'user_message',
  AgentMessage = 'agent_message',
  Plan = 'plan',
  Command = 'command',
  Diff = 'diff',
  Approval = 'approval',
  Notice = 'notice',
  ContextCompaction = 'context_compaction',
}

export enum CodexTimelineItemStatus {
  Streaming = 'streaming',
  Completed = 'completed',
  Failed = 'failed',
}

export enum CodexTimelineItemSource {
  Optimistic = 'optimistic',
  Realtime = 'realtime',
  Snapshot = 'snapshot',
}

export interface CodexTimelineItemHeader {
  item_id: string
  thread_id: string
  turn_id: string | null
  detail_kind: CodexTimelineItemKind
  schema_version: typeof CODEX_TIMELINE_ITEM_SCHEMA_VERSION
  status: CodexTimelineItemStatus
  created_at?: string | null
  /** 鐢ㄤ簬鎶婃潈濞佺殑 userMessage 涓庢湰鍦拌姹傛寜鎿嶄綔 ID 瀵硅处，缁濅笉浠ユ鏂囧尮閰嶃€?*/
  client_operation_id?: string | null
}

interface CodexTimelineDetailBase {
  content?: CodexContentDescriptor
  schema_version: typeof CODEX_TIMELINE_ITEM_SCHEMA_VERSION
}

export interface CodexTextTimelineDetail extends CodexTimelineDetailBase {
  kind: CodexTimelineItemKind.UserMessage | CodexTimelineItemKind.AgentMessage
  text: string
}

export interface CodexNoticeTimelineDetail extends CodexTimelineDetailBase {
  kind: CodexTimelineItemKind.Notice
  label: string
  text: string
}

export interface CodexContextCompactionTimelineDetail extends CodexTimelineDetailBase {
  kind: CodexTimelineItemKind.ContextCompaction
  label: '上下文已压缩'
}

export interface CodexPlanStep {
  step: string
  status: 'pending' | 'in_progress' | 'completed'
}

export enum CodexDiffChangeKind {
  Added = 'added',
  Modified = 'modified',
  Deleted = 'deleted',
  Renamed = 'renamed',
}

export enum CodexDiffLineKind {
  Context = 'context',
  Addition = 'addition',
  Deletion = 'deletion',
}

export interface CodexDiffLine {
  kind: CodexDiffLineKind
  content: string
  old_line_number: number | null
  new_line_number: number | null
}

export interface CodexDiffHunk {
  header: string
  old_start: number
  new_start: number
  lines: CodexDiffLine[]
}

export interface CodexDiffFile {
  path: string
  old_path: string | null
  change_kind: CodexDiffChangeKind
  binary: boolean
  large: boolean
  truncated: boolean
  hunks: CodexDiffHunk[]
}

export interface CodexDiffSnapshot {
  files: CodexDiffFile[]
  total_characters: number
  truncated: boolean
}

export interface CodexPlanTimelineDetail extends CodexTimelineDetailBase {
  kind: CodexTimelineItemKind.Plan
  explanation: string
  steps: CodexPlanStep[]
}

export interface CodexCommandTimelineDetail extends CodexTimelineDetailBase {
  kind: CodexTimelineItemKind.Command
  command: string
  output: string
  exit_code: number | null
}

export interface CodexDiffTimelineDetail extends CodexTimelineDetailBase {
  kind: CodexTimelineItemKind.Diff
  diff: CodexDiffSnapshot
}

export interface CodexApprovalTimelineDetail extends CodexTimelineDetailBase {
  kind: CodexTimelineItemKind.Approval
  approval_id: string
  approval_kind: string
  risk_level: string
  state: string
  version: number
  summary: string
}

type CodexTimelineEnvelope<TDetail extends CodexTimelineItemDetail> = {
  header: CodexTimelineItemHeader & { detail_kind: TDetail['kind'] }
  detail: TDetail
}

export type CodexTextTimelineItem =
  CodexTimelineEnvelope<CodexTextTimelineDetail>
export type CodexNoticeTimelineItem =
  CodexTimelineEnvelope<CodexNoticeTimelineDetail>
export type CodexContextCompactionTimelineItem =
  CodexTimelineEnvelope<CodexContextCompactionTimelineDetail>
export type CodexPlanTimelineItem =
  CodexTimelineEnvelope<CodexPlanTimelineDetail>
export type CodexCommandTimelineItem =
  CodexTimelineEnvelope<CodexCommandTimelineDetail>
export type CodexDiffTimelineItem =
  CodexTimelineEnvelope<CodexDiffTimelineDetail>
export type CodexApprovalTimelineItem =
  CodexTimelineEnvelope<CodexApprovalTimelineDetail>

export type CodexTimelineItemDetail =
  | CodexTextTimelineDetail
  | CodexNoticeTimelineDetail
  | CodexContextCompactionTimelineDetail
  | CodexPlanTimelineDetail
  | CodexCommandTimelineDetail
  | CodexDiffTimelineDetail
  | CodexApprovalTimelineDetail

export type CodexTimelineItem =
  | CodexTextTimelineItem
  | CodexNoticeTimelineItem
  | CodexContextCompactionTimelineItem
  | CodexPlanTimelineItem
  | CodexCommandTimelineItem
  | CodexDiffTimelineItem
  | CodexApprovalTimelineItem

/**
 * 仅在当前标签页内存回收后使用的渲染占位符。它保留稳定定位字段与原类型，
 * 但不保留正文；恢复必须按 item ID 向权威历史读取，绝不以正文搜索或匹配。
 */
export interface CodexEvictedTimelineItem {
  header: CodexTimelineItemHeader
  detail: {
    kind: 'evicted'
    schema_version: typeof CODEX_TIMELINE_ITEM_SCHEMA_VERSION
    original_kind: CodexTimelineItemKind
  }
}

export type CodexTimelineRenderableItem =
  | CodexTimelineItem
  | CodexEvictedTimelineItem
