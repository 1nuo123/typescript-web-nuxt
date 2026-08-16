export const AUTH_REFRESH_SKEW_MS = 30_000
export const AUTH_BEARER_TOKEN_TYPE = 'Bearer'
export const AUTH_TOKEN_PATH = '/auth/token'
export const AUTH_REFRESH_PATH = '/auth/refresh'
export const AUTH_REVOKE_PATH = '/auth/revoke'
export const AUTH_ME_PATH = '/auth/me'
export const AUTH_REGISTER_PATH = '/auth/register'
export const AUTH_BROWSER_TOKEN_PATH = '/auth/browser/token'
export const AUTH_BROWSER_REFRESH_PATH = '/auth/browser/refresh'
export const AUTH_BROWSER_REVOKE_PATH = '/auth/browser/revoke'
export const AUTH_STEP_UP_PATH = '/auth/step-up'
export const AUTH_PUBLIC_API_ENDPOINTS = [
  AUTH_TOKEN_PATH,
  AUTH_REFRESH_PATH,
  AUTH_REVOKE_PATH,
  AUTH_REGISTER_PATH,
  AUTH_BROWSER_TOKEN_PATH,
  AUTH_BROWSER_REFRESH_PATH,
  AUTH_BROWSER_REVOKE_PATH,
] as const

export enum AuthRole {
  Admin = 'admin',
  RegisteredUser = 'registered_user',
}

export enum AuthScope {
  AuthRead = 'auth:read',
  AuthManage = 'auth:manage',
  SecurityManage = 'security:manage',
  SystemRead = 'system:read',
  SystemManage = 'system:manage',
  TaskDispatch = 'task:dispatch',
  CodexRead = 'codex:read',
  CodexOperate = 'codex:operate',
  CodexApprove = 'codex:approve',
  CodexHostManage = 'codex:host_manage',
  CodexFiles = 'codex:files',
  CodexTerminal = 'codex:terminal',
  CodexNetwork = 'codex:network',
  CodexFullAccess = 'codex:full_access',
  CodexAdminManage = 'codex:admin_manage',
}

export enum AdminBoundaryPolicy {
  Public = 'public',
  BusinessAdmin = 'business_admin',
  OpsOnly = 'ops_only',
}

export enum PermissionMode {
  All = 'all',
  Any = 'any',
}

export enum AuthSessionStatus {
  Anonymous = 'anonymous',
  RegistrationPending = 'registration_pending',
  LoginPending = 'login_pending',
  Authenticated = 'authenticated',
  Refreshing = 'refreshing',
  Throttled = 'throttled',
  Disabled = 'disabled',
  Forbidden = 'forbidden',
  Revoked = 'revoked',
  Reused = 'reused',
  Error = 'error',
}

export enum AuthStepUpPurpose {
  CodexHighRiskApproval = 'codex.high_risk_approval',
  CodexHostRevoke = 'codex.host.revoke',
}

export enum AuthErrorCode {
  TokenExpired = 'auth.token.expired',
  TokenInvalid = 'auth.token.invalid',
  TokenRevoked = 'auth.token.revoked',
  TokenReused = 'auth.token.reused',
  RequestThrottled = 'auth.request.throttled',
  AccountDisabled = 'auth.access.account_disabled',
  PermissionDenied = 'auth.authorization.permission_denied',
  RegistrationDisabled = 'auth.registration.disabled',
  RegistrationUsernameConflict = 'auth.registration.username_conflict',
}

export type AuthRoleKey = AuthRole
export type AuthScopeCode = AuthScope
export type AuthBearerTokenType = typeof AUTH_BEARER_TOKEN_TYPE

export interface TokenIssuePayload {
  kind: 'token_issue'
  schema_version?: string
  access_token: string
  refresh_token: string
  token_type: AuthBearerTokenType
  expires_in_seconds: number
  refresh_expires_in_seconds: number
}

export interface BrowserTokenIssuePayload {
  kind: 'browser_token_issue'
  schema_version: '1.0'
  access_token: string
  token_type: AuthBearerTokenType
  expires_in_seconds: number
}

export interface UserRegistrationRequest {
  username: string
  password: string
}

export interface UserRegistrationPayload {
  kind: 'user_registration'
  schema_version: '1.0'
  subject_id: string
  username: string
}

export interface TokenRevokePayload {
  kind: 'token_revoke'
  schema_version?: string
  revoked: boolean
  revoked_at_epoch?: number
}

export interface StepUpGrantPayload {
  grant_token: string
  expires_at: string
}

export interface AuthenticatedPrincipal {
  kind: 'authenticated_principal'
  schema_version?: string
  subject_id: string
  username: string
  roles: AuthRoleKey[]
  scopes: AuthScopeCode[]
  is_admin: boolean
}

export interface AuthRequirement {
  requiredRoles?: AuthRoleKey[]
  requiredScopes?: AuthScopeCode[]
  permissionMode?: PermissionMode
  adminBoundaryPolicy?: AdminBoundaryPolicy
}
