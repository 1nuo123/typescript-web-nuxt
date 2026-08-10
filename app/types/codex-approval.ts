export enum CodexApprovalDecision {
  Accept = 'accept',
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

export interface CodexApproval {
  approval_id: string
  owner_subject_id: string
  host_id: string
  workspace_id: string | null
  thread_id: string
  turn_id: string | null
  item_id: string | null
  approval_kind: CodexApprovalKind
  risk_level: CodexApprovalRiskLevel
  payload_digest: string
  display_summary: {
    title?: string
    reason?: string
    workspace_name?: string | null
    risk_level: CodexApprovalRiskLevel
    command_summary?: string | null
    file_scope: string[]
    permission_names: string[]
    network_requested: boolean
    extra_root_requested: boolean
  }
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

export interface CodexApprovalCollection {
  items: CodexApproval[]
}

export interface CodexApprovalDecisionRequest {
  decision: CodexApprovalDecision
  approval_version: number
}
