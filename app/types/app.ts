import type {
  AdminBoundaryPolicy,
  AuthRoleKey,
  AuthScopeCode,
  PermissionMode,
} from './auth'

export type ThemePreference = 'light' | 'dark' | 'system'

export type ResolvedTheme = 'light' | 'dark'

export const DEFAULT_APP_NAME = '应用骨架'

export enum RuntimeFeatureFlag {
  AdminOps = 'adminOpsEnabled',
  Codex = 'codexFeatureEnabled',
}

export interface AppNavItem {
  label: string
  to: string
  exact?: boolean
  disabled?: boolean
  requiresAuth?: boolean
  requiredRoles?: AuthRoleKey[]
  requiredScopes?: AuthScopeCode[]
  permissionMode?: PermissionMode
  adminBoundaryPolicy?: AdminBoundaryPolicy
  requiredRuntimeFlag?: RuntimeFeatureFlag
}

export enum RuntimeLogSource {
  Vue = 'vue',
  Window = 'window',
  Promise = 'promise',
  Request = 'request',
  Manual = 'manual',
}

export const RUNTIME_ERROR_STATUS_CODE = 500
export const RUNTIME_ERROR_STATUS_MESSAGE = 'Runtime Error'
export const RUNTIME_ERROR_FALLBACK_MESSAGE = '应用运行时错误。'
export const SERVER_RUNTIME_ERROR_FALLBACK_MESSAGE = '应用服务端运行时错误。'

export interface RuntimeLogEntry {
  id: string
  source: RuntimeLogSource
  message: string
  detail?: string
  createdAt: string
}
