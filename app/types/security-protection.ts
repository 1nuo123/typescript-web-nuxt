export const SECURITY_PROTECTION_SCHEMA_VERSION = '1.0'
export const SECURITY_PROTECTION_DEFAULT_LIMIT = 50

export enum SecurityProtectionPayloadKind {
  IpBlockRecord = 'security_ip_block_record_payload',
  IpBlockCreate = 'security_ip_block_create',
  IpBlockCreatePayload = 'security_ip_block_create_payload',
  IpBlockRelease = 'security_ip_block_release',
  IpBlockList = 'security_ip_block_list',
}

export enum SecurityIpBlockReason {
  Manual = 'manual',
}

export interface SecurityIpBlockRecordPayload {
  kind: SecurityProtectionPayloadKind.IpBlockRecord
  schema_version: string
  record_id: string
  ip_digest: string
  reason: string
  status: string
  blocked_until_epoch: number
  released_reason: string | null
}

export interface SecurityIpBlockListPayload {
  kind: SecurityProtectionPayloadKind.IpBlockList
  schema_version: string
  records: SecurityIpBlockRecordPayload[]
}

export interface SecurityIpBlockCreateRequest {
  kind: SecurityProtectionPayloadKind.IpBlockCreate
  schema_version: string
  ip_digest: string
  reason: SecurityIpBlockReason
  block_seconds: number
}

export interface SecurityIpBlockCreatePayload {
  kind: SecurityProtectionPayloadKind.IpBlockCreatePayload
  schema_version: string
  record: SecurityIpBlockRecordPayload
}

export interface SecurityIpBlockReleaseRequest {
  kind: SecurityProtectionPayloadKind.IpBlockRelease
  schema_version: string
  ip_digest: string
  released_reason: string
}

export interface SecurityIpBlockReleasePayload {
  kind: SecurityProtectionPayloadKind.IpBlockRelease
  schema_version: string
  ip_digest: string
  released: boolean
}

export interface SecurityIpBlockQuery {
  limit?: number
  status?: string
  ip_digest?: string
}
