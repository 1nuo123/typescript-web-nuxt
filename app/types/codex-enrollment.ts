import type { DeviceAuthorizationEnvelope } from './codex-device'

export const CODEX_ENROLLMENT_INTENT_KIND = 'codex_enrollment_intent'
export const CODEX_ENROLLMENT_INTENT_SCHEMA_VERSION = '1.0'

export enum CodexEnrollmentIntentState {
  Issued = 'issued',
  Consuming = 'consuming',
  Consumed = 'consumed',
}

export interface CodexEnrollmentIntentRequestHeader {
  kind: typeof CODEX_ENROLLMENT_INTENT_KIND
  schema_version: typeof CODEX_ENROLLMENT_INTENT_SCHEMA_VERSION
  request_id: string
}

export interface CodexEnrollmentIntentIssuedDetail {
  state: CodexEnrollmentIntentState.Issued
  launch_uri: string
  expires_at: string
}

export interface CodexEnrollmentIntentStatusDetail {
  state: CodexEnrollmentIntentState
  expires_at: string
  user_code: string | null
  authorization: DeviceAuthorizationEnvelope | null
  host_id?: string | null
}

export interface CodexEnrollmentIntentEnvelope {
  header: {
    kind: typeof CODEX_ENROLLMENT_INTENT_KIND
    schema_version: typeof CODEX_ENROLLMENT_INTENT_SCHEMA_VERSION
    intent_id: string
  }
  detail: CodexEnrollmentIntentIssuedDetail | CodexEnrollmentIntentStatusDetail
}

export interface CodexEnrollmentIntentCreateRequestEnvelope {
  header: CodexEnrollmentIntentRequestHeader
  detail: {
    return_path: string
  }
}
