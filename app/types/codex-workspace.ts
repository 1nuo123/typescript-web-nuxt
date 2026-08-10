export interface CodexWorktreePolicy {
  enabled: boolean
  base_branch: string
  max_active: number
  retention_seconds: number
  disk_watermark_percent: number
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
  enabled: boolean
  created_at: string
  updated_at: string
  version: number
}

export interface CodexWorkspaceUpdateRequest {
  display_name?: string
  enabled?: boolean
  worktree_policy?: CodexWorktreePolicy
}

export interface CodexWorkspaceCollection {
  items: CodexWorkspace[]
}
