import type { AdminEnvelope } from './api'

export const ADMIN_IDENTITY_SCHEMA_VERSION = '1.0'
export const ADMIN_IDENTITY_DEFAULT_PAGE_SIZE = 20
export const ADMIN_IDENTITY_DEFAULT_OFFSET = 0
export const ADMIN_IDENTITY_DEFAULT_LIMIT = 50
/** 后端高危授权变更二次确认短语,必须逐字一致。 */
export const ADMIN_IDENTITY_GRANT_CONFIRMATION_PHRASE = 'confirm-admin-grant'

export enum AdminIdentityOperationName {
  ScopeList = 'scope_list',
  ScopeDetail = 'scope_detail',
  ScopeCreate = 'scope_create',
  ScopeUpdate = 'scope_update',
  ScopeDelete = 'scope_delete',
  RoleList = 'role_list',
  RoleDetail = 'role_detail',
  RoleCreate = 'role_create',
  RoleUpdate = 'role_update',
  RoleScopeReplace = 'role_scope_replace',
  RoleDelete = 'role_delete',
  UserList = 'user_list',
  UserDetail = 'user_detail',
  UserCreate = 'user_create',
  UserUpdate = 'user_update',
  UserPasswordReset = 'user_password_reset',
  UserRoleReplace = 'user_role_replace',
  UserScopeReplace = 'user_scope_replace',
  UserDelete = 'user_delete',
  UserDisable = 'user_disable',
  UserEnable = 'user_enable',
}

export enum AdminIdentityPayloadKind {
  Scope = 'admin_scope',
  ScopeList = 'admin_scope_list',
  ScopeCreate = 'admin_scope_create',
  ScopeUpdate = 'admin_scope_update',
  ScopeDeleteResult = 'admin_scope_delete_result',
  Role = 'admin_role',
  RoleList = 'admin_role_list',
  RoleCreate = 'admin_role_create',
  RoleUpdate = 'admin_role_update',
  RoleScopeReplace = 'admin_role_scope_replace',
  RoleDeleteResult = 'admin_role_delete_result',
  User = 'admin_user',
  UserList = 'admin_user_list',
  UserCreate = 'admin_user_create',
  UserUpdate = 'admin_user_update',
  UserPasswordReset = 'admin_user_password_reset',
  UserRoleReplace = 'admin_user_role_replace',
  UserScopeReplace = 'admin_user_scope_replace',
  UserDeleteResult = 'admin_user_delete_result',
  UserDisable = 'admin_user_disable',
  UserEnable = 'admin_user_enable',
  UserStatusResult = 'admin_user_status_result',
  BusinessRole = 'admin_business_role',
  BusinessRoleList = 'admin_business_role_list',
}

export interface AdminScopePayload {
  kind: AdminIdentityPayloadKind.Scope
  schema_version: string
  scope_code: string
  scope_name: string
  description: string | null
  enabled: boolean
  scope_kind?: string
}

export interface AdminScopeListPayload {
  kind: AdminIdentityPayloadKind.ScopeList
  schema_version: string
  scopes: AdminScopePayload[]
}

export interface AdminScopeMutateDetail {
  kind:
    | AdminIdentityPayloadKind.ScopeCreate
    | AdminIdentityPayloadKind.ScopeUpdate
  schema_version: string
  scope_code?: string
  scope_name: string
  description: string | null
  enabled: boolean
}

export interface AdminRolePayload {
  kind: AdminIdentityPayloadKind.Role
  schema_version: string
  role_key: string
  role_name: string
  scope_codes: string[]
  user_count: number
}

export interface AdminRoleListPayload {
  kind: AdminIdentityPayloadKind.RoleList
  schema_version: string
  roles: AdminRolePayload[]
  page_size: number
  offset: number
  total: number
}

export interface AdminBusinessRolePayload {
  kind: AdminIdentityPayloadKind.BusinessRole
  schema_version: string
  role_key: string
  role_name: string
}

export interface AdminBusinessRoleListPayload {
  kind: AdminIdentityPayloadKind.BusinessRoleList
  schema_version: string
  roles: AdminBusinessRolePayload[]
  page_size: number
  offset: number
  total: number
}

export interface AdminRoleMutateDetail {
  kind:
    | AdminIdentityPayloadKind.RoleCreate
    | AdminIdentityPayloadKind.RoleUpdate
  schema_version: string
  role_key?: string
  role_name: string
  scope_codes?: string[]
  /** 创建包含受保护 scope 的角色时必填,取值须为确认短语。 */
  confirmation?: string | null
}

export interface AdminRoleScopeReplaceDetail {
  kind: AdminIdentityPayloadKind.RoleScopeReplace
  schema_version: string
  scope_codes: string[]
  confirmation: string
}

export interface AdminUserPayload {
  kind: AdminIdentityPayloadKind.User
  schema_version: string
  subject_id: string
  username: string
  is_active: boolean
  role_keys: string[]
  direct_scope_codes: string[]
  effective_scope_codes: string[]
}

export interface AdminUserListPayload {
  kind: AdminIdentityPayloadKind.UserList
  schema_version: string
  users: AdminUserPayload[]
  page_size: number
  offset: number
  total: number
}

export interface AdminUserCreateDetail {
  kind: AdminIdentityPayloadKind.UserCreate
  schema_version: string
  username: string
  password: string
  role_keys: string[]
  subject_id?: string | null
}

export interface AdminUserUpdateDetail {
  kind: AdminIdentityPayloadKind.UserUpdate
  schema_version: string
  username: string | null
}

export interface AdminUserPasswordResetDetail {
  kind: AdminIdentityPayloadKind.UserPasswordReset
  schema_version: string
  password: string
}

export interface AdminUserRoleReplaceDetail {
  kind: AdminIdentityPayloadKind.UserRoleReplace
  schema_version: string
  role_keys: string[]
  confirmation: string
}

export interface AdminUserScopeReplaceDetail {
  kind: AdminIdentityPayloadKind.UserScopeReplace
  schema_version: string
  scope_codes: string[]
  confirmation: string
}

export interface AdminUserStatusDetail {
  kind:
    | AdminIdentityPayloadKind.UserDisable
    | AdminIdentityPayloadKind.UserEnable
  schema_version: string
  reason: string | null
}

export interface AdminUserStatusResultPayload {
  kind: AdminIdentityPayloadKind.UserStatusResult
  schema_version: string
  subject_id: string
  status: string
  is_active: boolean
  reason: string | null
}

export interface AdminIdentityDeleteResultPayload {
  kind:
    | AdminIdentityPayloadKind.ScopeDeleteResult
    | AdminIdentityPayloadKind.RoleDeleteResult
    | AdminIdentityPayloadKind.UserDeleteResult
  schema_version: string
  target_id: string
  deleted: boolean
  reason: string | null
}

export type AdminIdentityEnvelope<TDetail> = AdminEnvelope<
  TDetail,
  AdminIdentityPayloadKind,
  AdminIdentityOperationName
>
