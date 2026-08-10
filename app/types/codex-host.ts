export enum CodexHostStatus {
  Enrolling = 'enrolling',
  Online = 'online',
  Offline = 'offline',
  Incompatible = 'incompatible',
  Revoked = 'revoked',
}

export enum CodexCapabilityCode {
  ModelList = 'model.list',
  ThreadList = 'thread.list',
  ThreadRead = 'thread.read',
  ThreadStart = 'thread.start',
  ThreadResume = 'thread.resume',
  ThreadDelete = 'thread.delete',
  ThreadCompact = 'thread.compact',
  TurnStart = 'turn.start',
  TurnSteer = 'turn.steer',
  TurnInterrupt = 'turn.interrupt',
  ApprovalCommand = 'approval.command',
  ApprovalFileChange = 'approval.file_change',
  ApprovalPermissions = 'approval.permissions',
  EventReplay = 'event.replay',
  SnapshotPagination = 'snapshot.pagination',
}

export enum CodexHostCompatibilityState {
  Unknown = 'unknown',
  Compatible = 'compatible',
  ReadOnly = 'read_only',
  UpgradeRequired = 'upgrade_required',
  Blocked = 'blocked',
}

export enum CodexHostUpdateState {
  Unknown = 'unknown',
  Current = 'current',
  Available = 'available',
  Updating = 'updating',
  Failed = 'failed',
}

export enum CodexHostDoctorState {
  Unknown = 'unknown',
  Healthy = 'healthy',
  Degraded = 'degraded',
  Blocked = 'blocked',
}

export interface CodexCapabilityDetail {
  code: CodexCapabilityCode
  version: number
}

export interface CodexHostCapabilities {
  items: CodexCapabilityDetail[]
  model_ids: string[]
  reasoning_efforts: string[]
  sandbox_modes: CodexSandboxMode[]
  approval_policies: CodexApprovalPolicy[]
}

export enum CodexSandboxMode {
  ReadOnly = 'read-only',
  WorkspaceWrite = 'workspace-write',
  DangerFullAccess = 'danger-full-access',
}

export enum CodexApprovalPolicy {
  Untrusted = 'untrusted',
  OnRequest = 'on-request',
  Never = 'never',
}

export interface CodexHostCompatibilityDetail {
  state: CodexHostCompatibilityState
  reason_code: string | null
}

export interface CodexHostUpdateDetail {
  state: CodexHostUpdateState
  channel: string
  current_version: string | null
  target_version: string | null
  last_checked_at: string | null
  last_result: string | null
  security_deadline: string | null
}

export interface CodexHostDoctorDetail {
  state: CodexHostDoctorState
  checked_at: string | null
  issue_codes: string[]
}

export interface CodexHost {
  host_id: string
  owner_subject_id: string
  display_name: string
  platform: string
  agent_version: string | null
  codex_version: string | null
  agent_protocol_version: string | null
  app_server_schema_digest: string | null
  status: CodexHostStatus
  capabilities: CodexHostCapabilities
  compatibility: CodexHostCompatibilityDetail
  update: CodexHostUpdateDetail
  doctor: CodexHostDoctorDetail
  last_seen_at: string | null
  revoked_at: string | null
  created_at: string
  updated_at: string
  version: number
}

export interface CodexHostCollection {
  items: CodexHost[]
}

export interface CodexHostRenameRequest {
  display_name: string
}

export interface CodexHostRevokeRequest {
  step_up_token: string
}
