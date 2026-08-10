export enum CodexTimelineItemKind {
  UserMessage = 'user_message',
  AgentMessage = 'agent_message',
  Plan = 'plan',
  Command = 'command',
  Diff = 'diff',
  Notice = 'notice',
}

export enum CodexTimelineItemStatus {
  Streaming = 'streaming',
  Completed = 'completed',
  Failed = 'failed',
}

interface CodexTimelineItemBase {
  item_id: string
  thread_id: string
  turn_id: string | null
  status: CodexTimelineItemStatus | string
  created_at?: string | null
}

export interface CodexTextTimelineItem extends CodexTimelineItemBase {
  kind:
    | CodexTimelineItemKind.UserMessage
    | CodexTimelineItemKind.AgentMessage
    | CodexTimelineItemKind.Notice
  text: string
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

export interface CodexPlanTimelineItem extends CodexTimelineItemBase {
  kind: CodexTimelineItemKind.Plan
  explanation?: string
  steps: CodexPlanStep[]
}

export interface CodexCommandTimelineItem extends CodexTimelineItemBase {
  kind: CodexTimelineItemKind.Command
  command: string
  output: string
  exit_code: number | null
}

export interface CodexDiffTimelineItem extends CodexTimelineItemBase {
  kind: CodexTimelineItemKind.Diff
  diff: CodexDiffSnapshot
}

export type CodexTimelineItem =
  | CodexTextTimelineItem
  | CodexPlanTimelineItem
  | CodexCommandTimelineItem
  | CodexDiffTimelineItem
