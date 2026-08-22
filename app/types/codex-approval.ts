export enum CodexApprovalDecision {
  Accept = 'accept',
  AcceptForSession = 'acceptForSession',
  AcceptWithExecpolicyAmendment = 'acceptWithExecpolicyAmendment',
  ApplyNetworkPolicyAmendment = 'applyNetworkPolicyAmendment',
  Decline = 'decline',
  Cancel = 'cancel',
}

export enum CodexApprovalKind {
  Command = 'command',
  FileChange = 'file_change',
  Permissions = 'permissions',
}

export enum CodexApprovalRiskLevel {
  Normal = 'normal',
  High = 'high',
}

export enum CodexApprovalState {
  Pending = 'pending',
  Claimed = 'claimed',
  Applied = 'applied',
  DeliveryFailed = 'delivery_failed',
  Expired = 'expired',
  Cancelled = 'cancelled',
}

export enum CodexApprovalDecisionState {
  Idle = 'idle',
  Submitting = 'submitting',
  Acknowledged = 'acknowledged',
  Failed = 'failed',
}

export interface CodexApprovalCommandAction {
  action_type: string
  command: string
  path: string | null
  name: string | null
  query: string | null
}

export interface CodexApprovalFileChange {
  path: string
  change_kind: string
  added_lines: number | null
  deleted_lines: number | null
  sensitive: boolean
}

export interface CodexApprovalDisplaySummaryBase {
  title?: string
  reason?: string
  workspace_name: string | null
  risk_level: CodexApprovalRiskLevel
  risk_reason: string | null
  allowed_actions: CodexApprovalDecision[]
}

/** 命令审批只携带 Agent 已脱敏的命令展示字段。 */
export interface CodexCommandApprovalDisplaySummary extends CodexApprovalDisplaySummaryBase {
  command_summary: string | null
  command: string | null
  command_actions: CodexApprovalCommandAction[]
  working_directory: string | null
  read_only: boolean
}

/** 文件变更审批只携带工作区相对路径与变更摘要。 */
export interface CodexFileChangeApprovalDisplaySummary extends CodexApprovalDisplaySummaryBase {
  file_scope: string[]
  file_changes: CodexApprovalFileChange[]
}

/** 权限审批只携带固定权限名称与服务端计算出的权限范围。 */
export interface CodexPermissionsApprovalDisplaySummary extends CodexApprovalDisplaySummaryBase {
  permission_names: string[]
  network_requested: boolean
  extra_root_requested: boolean
}

export interface CodexApprovalBase {
  approval_id: string
  owner_subject_id: string
  host_id: string
  workspace_id: string | null
  thread_id: string
  turn_id: string | null
  item_id: string | null
  risk_level: CodexApprovalRiskLevel
  payload_digest: string
  state: CodexApprovalState
  version: number
  expires_at: string | null
  decided_by: string | null
  decision: CodexApprovalDecision | null
  decided_at: string | null
  applied_at: string | null
  created_at: string
  updated_at: string
}

export interface CodexCommandApproval extends CodexApprovalBase {
  approval_kind: CodexApprovalKind.Command
  display_summary: CodexCommandApprovalDisplaySummary
}

export interface CodexFileChangeApproval extends CodexApprovalBase {
  approval_kind: CodexApprovalKind.FileChange
  display_summary: CodexFileChangeApprovalDisplaySummary
}

export interface CodexPermissionsApproval extends CodexApprovalBase {
  approval_kind: CodexApprovalKind.Permissions
  display_summary: CodexPermissionsApprovalDisplaySummary
}

/** approval_kind 是前端展示字段的判别器，禁止跨类型读取未授权的摘要字段。 */
export type CodexApproval =
  | CodexCommandApproval
  | CodexFileChangeApproval
  | CodexPermissionsApproval

export interface CodexApprovalCollection {
  items: CodexApproval[]
}

export interface CodexApprovalDecisionRequest {
  decision: CodexApprovalDecision
  approval_version: number
}
