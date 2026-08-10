import type { AdminEnvelope } from './api'

export const ADMIN_AUDIT_SCHEMA_VERSION = '1.0'
export const ADMIN_AUDIT_DEFAULT_PAGE_SIZE = 20
export const ADMIN_AUDIT_DEFAULT_OFFSET = 0

export enum AdminAuditOperationName {
  EventList = 'event_list',
}

export enum AdminAuditPayloadKind {
  Event = 'admin_audit_event',
  EventList = 'admin_audit_event_list',
}

export enum AdminAuditResult {
  Success = 'success',
  Failed = 'failed',
}

export enum AdminAuditAction {
  UserCreated = 'user_created',
  UserUpdated = 'user_updated',
  UserDisabled = 'user_disabled',
  UserEnabled = 'user_enabled',
  PasswordReset = 'password_reset',
  RoleAssigned = 'role_assigned',
}

export interface AdminAuditEventPayload {
  kind: AdminAuditPayloadKind.Event
  schema_version: string
  event_id: string
  action: AdminAuditAction | string
  actor_subject_id: string
  target_kind: string
  target_id: string
  result: string
  occurred_at: string
  summary: string
}

export interface AdminAuditEventListPayload {
  kind: AdminAuditPayloadKind.EventList
  schema_version: string
  events: AdminAuditEventPayload[]
  page_size: number
  offset: number
  total: number
}

export interface AdminAuditQuery {
  actor_subject_id?: string
  /** 后端为 AdminAuditAction 枚举,空串会在发送前剔除。 */
  action?: AdminAuditAction | ''
  target_kind?: string
  target_id?: string
  occurred_from?: string
  occurred_to?: string
  page_size?: number
  offset?: number
}

export type AdminAuditEnvelope<TDetail> = AdminEnvelope<
  TDetail,
  AdminAuditPayloadKind,
  AdminAuditOperationName
>
