import type { CodexApprovalPolicy, CodexSandboxMode } from './codex-host'

export interface CodexWorktreePolicy {
  enabled: boolean
  base_branch: string
  max_active: number
  retention_seconds: number
  disk_watermark_percent: number
}

export enum WorkspaceSelectionState {
  Loading = 'loading',
  Resolved = 'resolved',
  Missing = 'missing',
  Revoked = 'revoked',
}

export interface CodexWorkspace {
  workspace_id: string
  host_id: string
  owner_subject_id: string
  agent_workspace_key: string
  display_name: string
  repo_fingerprint: string | null
  default_branch: string | null
  worktree_policy: CodexWorktreePolicy
  execution_preferences: CodexWorkspaceExecutionPreferences
  is_pinned: boolean
  enabled: boolean
  created_at: string
  updated_at: string
  version: number
}

/** 工作区级执行偏好；仅保存可重校验的模型和安全策略，不保存会话正文。 */
export interface CodexWorkspaceExecutionPreferences {
  model: string | null
  reasoning_effort: string | null
  sandbox_mode: CodexSandboxMode
  approval_policy: CodexApprovalPolicy
  capabilities_revision: string
}

/** 服务端主动收敛偏好时返回的字段名，用于向用户解释本次调整。 */
export type CodexWorkspacePreferenceAdjustedField =
  | 'model'
  | 'reasoning_effort'
  | 'sandbox_mode'
  | 'approval_policy'
  | 'capabilities_revision'

export interface CodexWorkspaceExecutionPreferencesResult {
  workspace_id: string
  effective_preferences: CodexWorkspaceExecutionPreferences
  adjusted_fields: CodexWorkspacePreferenceAdjustedField[]
}

export interface CodexWorkspaceExecutionPreferencesUpdate {
  model: string | null
  reasoning_effort: string | null
  sandbox_mode: CodexSandboxMode
  approval_policy: CodexApprovalPolicy
}

export interface CodexWorkspaceUpdateRequest {
  display_name?: string
  is_pinned?: boolean
  enabled?: boolean
  worktree_policy?: CodexWorktreePolicy
}

export interface CodexWorkspaceCollection {
  items: CodexWorkspace[]
}
