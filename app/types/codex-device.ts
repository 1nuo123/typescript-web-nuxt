export const CODEX_DEVICE_CONTRACT_KIND = 'codex_device_authorization'
export const CODEX_DEVICE_CONTRACT_VERSION = '1.0'

export enum DeviceAuthorizationState {
  PendingUser = 'pending_user',
  Approving = 'approving',
  Approved = 'approved',
  Denied = 'denied',
  Expired = 'expired',
  Cancelled = 'cancelled',
  Consumed = 'consumed',
}

export enum DeviceAuthorizationDecision {
  Approve = 'approve',
  Deny = 'deny',
}

export enum CodexDeviceErrorCode {
  NotFound = 'codex.device_authorization.not_found',
  Expired = 'codex.device_authorization.expired',
  Pending = 'codex.device_authorization.pending',
  Denied = 'codex.device_authorization.denied',
  SlowDown = 'codex.device_authorization.slow_down',
  StateConflict = 'codex.state.conflict',
  VersionConflict = 'codex.version.conflict',
}

export interface DeviceAuthorizationRequestHeader {
  kind: typeof CODEX_DEVICE_CONTRACT_KIND
  schema_version: typeof CODEX_DEVICE_CONTRACT_VERSION
  request_id: string
}

export interface DeviceAuthorizationStatusDetail {
  kind: 'status'
  state: DeviceAuthorizationState
  display_name: string
  platform: string
  public_key_fingerprint: string
  interval_seconds: number
  expires_at: string
  host_id: string | null
  key_id: string | null
}

export interface DeviceAuthorizationEnvelope {
  header: {
    kind: typeof CODEX_DEVICE_CONTRACT_KIND
    schema_version: typeof CODEX_DEVICE_CONTRACT_VERSION
    enrollment_id: string
  }
  detail: DeviceAuthorizationStatusDetail
}

export interface DeviceAuthorizationDecideRequestEnvelope {
  header: DeviceAuthorizationRequestHeader
  detail: {
    enrollment_id: string
    user_code: string
    decision: DeviceAuthorizationDecision
    idempotency_key: string
  }
}

export interface DeviceAuthorizationView {
  hostId: string | null
  enrollmentId: string
  userCode: string
  state: DeviceAuthorizationState
  displayName: string
  platform: string
  fingerprint: string
  expiresAt: string
}
