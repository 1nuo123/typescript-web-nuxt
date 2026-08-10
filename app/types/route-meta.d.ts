import type {
  AdminBoundaryPolicy,
  AuthRoleKey,
  AuthScopeCode,
  PermissionMode,
} from './auth'
import type { RuntimeFeatureFlag } from './app'

declare module '#app' {
  interface PageMeta {
    title?: string
    requiresAuth?: boolean
    guestOnly?: boolean
    requiredRoles?: AuthRoleKey[]
    requiredScopes?: AuthScopeCode[]
    permissionMode?: PermissionMode
    adminBoundaryPolicy?: AdminBoundaryPolicy
    requiredRuntimeFlag?: RuntimeFeatureFlag
    redirectTo?: string
  }
}

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    requiresAuth?: boolean
    guestOnly?: boolean
    requiredRoles?: AuthRoleKey[]
    requiredScopes?: AuthScopeCode[]
    permissionMode?: PermissionMode
    adminBoundaryPolicy?: AdminBoundaryPolicy
    requiredRuntimeFlag?: RuntimeFeatureFlag
    redirectTo?: string
  }
}

export {}
