import { defineStore } from 'pinia'
import type { ApiErrorPayload, ApiRequestOptions } from '~/types/api'
import {
  AUTH_BEARER_TOKEN_TYPE,
  AUTH_REFRESH_SKEW_MS,
  AdminBoundaryPolicy,
  AuthErrorCode,
  type AuthStepUpPurpose,
  type AuthRequirement,
  type AuthBearerTokenType,
  AuthRole,
  type AuthRoleKey,
  type AuthScopeCode,
  type AuthenticatedPrincipal,
  AuthSessionStatus as AuthStatus,
  AuthScope,
  PermissionMode,
  type BrowserTokenIssuePayload,
  type TokenIssuePayload,
} from '~/types/auth'
import type { AppNavItem } from '~/types/app'

const INITIAL_SESSION_VERSION = 0
const AUTH_REFRESH_WEB_LOCK_NAME = 'auth-session-refresh'

const ADMIN_BOUNDARY_REQUIREMENTS: Record<
  AdminBoundaryPolicy,
  AuthRequirement
> = {
  [AdminBoundaryPolicy.Public]: {},
  [AdminBoundaryPolicy.BusinessAdmin]: {
    requiredRoles: [AuthRole.Admin],
    requiredScopes: [AuthScope.AuthRead],
    permissionMode: PermissionMode.All,
  },
  [AdminBoundaryPolicy.OpsOnly]: {
    requiredRoles: [AuthRole.Admin],
    requiredScopes: [AuthScope.SystemRead],
    permissionMode: PermissionMode.All,
  },
}

const AUTH_REFRESH_LOCKS = new WeakMap<object, Promise<boolean>>()
const AUTH_INIT_LOCKS = new WeakMap<object, Promise<void>>()
interface AuthStoreState {
  status: AuthStatus
  accessToken: string
  tokenType: AuthBearerTokenType
  expiresAt: number
  principal: AuthenticatedPrincipal | null
  initialized: boolean
  lastError: ApiErrorPayload | null
  sessionVersion: number
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthStoreState => ({
    status: AuthStatus.Anonymous,
    accessToken: '',
    tokenType: AUTH_BEARER_TOKEN_TYPE,
    expiresAt: 0,
    principal: null,
    initialized: false,
    lastError: null,
    sessionVersion: INITIAL_SESSION_VERSION,
  }),
  getters: {
    isAuthenticated: (state) => state.status === AuthStatus.Authenticated,
    roles: (state) => state.principal?.roles ?? [],
    scopes: (state) => state.principal?.scopes ?? [],
    isAdmin: (state) =>
      state.principal?.roles.includes(AuthRole.Admin) ?? false,
  },
  actions: {
    async initSession() {
      if (this.initialized) {
        return
      }
      const pendingInit = AUTH_INIT_LOCKS.get(this)
      if (pendingInit) return pendingInit

      const initRequest = (async () => {
        try {
          await this.refresh()
        } catch {
          this.clearSession(AuthStatus.Anonymous)
        } finally {
          this.initialized = true
        }
      })().finally(() => AUTH_INIT_LOCKS.delete(this))
      AUTH_INIT_LOCKS.set(this, initRequest)
      return initRequest
    },

    async login(username: string, password: string) {
      this.status = AuthStatus.LoginPending
      this.lastError = null

      try {
        const tokenIssue = await createAuthClient().token(username, password)
        this.applyTokenIssue(tokenIssue)
        await this.fetchMe()
      } catch (error) {
        const normalized = error as ApiErrorPayload
        this.consumeApiError(normalized)

        if (this.status === AuthStatus.LoginPending) {
          this.clearSession(AuthStatus.Anonymous)
        }

        throw normalized
      }
    },

    async register(username: string, password: string) {
      this.status = AuthStatus.RegistrationPending
      this.lastError = null

      try {
        await createAuthClient().register(username, password)
        await this.login(username, password)
      } catch (error) {
        const normalized = error as ApiErrorPayload

        if (this.status === AuthStatus.RegistrationPending) {
          this.consumeApiError(normalized)
        }

        if (this.status === AuthStatus.RegistrationPending) {
          this.clearSession(AuthStatus.Anonymous)
        }

        throw normalized
      }
    },

    async fetchMe(options: ApiRequestOptions = {}) {
      if (!this.accessToken) {
        this.clearSession(AuthStatus.Anonymous)
        return null
      }

      try {
        const principal = await createAuthClient().me(options)
        this.principal = principal
        this.status = AuthStatus.Authenticated
        this.lastError = null
        return principal
      } catch (error) {
        const normalized = error as ApiErrorPayload
        this.consumeApiError(normalized)
        throw normalized
      }
    },

    async refresh() {
      const pendingRefresh = AUTH_REFRESH_LOCKS.get(this)

      if (pendingRefresh) {
        return pendingRefresh
      }

      const runRefresh = () => this.runRefresh()
      const refreshRequest: Promise<boolean> =
        import.meta.client && typeof navigator.locks?.request === 'function'
          ? (navigator.locks.request(AUTH_REFRESH_WEB_LOCK_NAME, async () =>
              runRefresh(),
            ) as unknown as Promise<boolean>)
          : runRefresh()
      const nextRefresh = refreshRequest.finally(() => {
        AUTH_REFRESH_LOCKS.delete(this)
      })
      AUTH_REFRESH_LOCKS.set(this, nextRefresh)

      return nextRefresh
    },

    async runRefresh() {
      const sessionVersion = this.sessionVersion
      this.status = AuthStatus.Refreshing
      this.lastError = null

      try {
        const tokenIssue = await createAuthClient().refresh()

        if (this.sessionVersion !== sessionVersion) {
          return false
        }

        this.applyTokenIssue(tokenIssue)
        await this.fetchMe({ meta: { skipRefresh: true } })
        return true
      } catch (error) {
        const normalized = error as ApiErrorPayload
        this.consumeApiError(normalized, true)
        throw normalized
      }
    },

    async logout() {
      this.clearSession(AuthStatus.Anonymous)

      try {
        await createAuthClient().revoke()
      } catch {
        // Local logout is authoritative; revoke is best-effort.
      }
    },

    async issueStepUpGrant(
      password: string,
      purpose: AuthStepUpPurpose,
    ): Promise<string> {
      const grant = await createAuthClient().stepUp(password, purpose)
      return grant.grant_token
    },

    applyTokenIssue(payload: BrowserTokenIssuePayload | TokenIssuePayload) {
      const now = Date.now()

      this.sessionVersion += 1
      this.accessToken = payload.access_token
      this.tokenType = payload.token_type
      this.expiresAt = now + payload.expires_in_seconds * 1000
      this.status = AuthStatus.Authenticated
      this.lastError = null
    },

    clearSession(status: AuthStatus = AuthStatus.Anonymous) {
      this.sessionVersion += 1
      this.status = status
      this.accessToken = ''
      this.expiresAt = 0
      this.principal = null
    },

    consumeApiError(error: ApiErrorPayload, fromRefresh = false) {
      this.lastError = {
        statusCode: error.statusCode,
        statusMessage: error.statusMessage,
        message: error.message,
        code: error.code,
        errorCode: error.errorCode,
        requestId: error.requestId,
        traceId: error.traceId,
        kind: error.kind,
      }

      if (error.errorCode === AuthErrorCode.RequestThrottled) {
        this.status = AuthStatus.Throttled
        return
      }

      if (error.errorCode === AuthErrorCode.AccountDisabled) {
        this.clearSession(AuthStatus.Disabled)
        return
      }

      if (this.isHardLogoutError(error.errorCode)) {
        this.clearSession(
          error.errorCode === AuthErrorCode.TokenReused
            ? AuthStatus.Reused
            : error.errorCode === AuthErrorCode.TokenRevoked
              ? AuthStatus.Revoked
              : AuthStatus.Anonymous,
        )
        return
      }

      if (fromRefresh && this.isTokenExpiredError(error)) {
        this.clearSession(AuthStatus.Anonymous)
        return
      }

      if (error.statusCode >= 500) {
        // Transient API failures do not invalidate an otherwise valid session.
        // Preserve it so protected realtime views can recover after reconnect.
        this.status =
          this.accessToken && this.principal
            ? AuthStatus.Authenticated
            : AuthStatus.Error
      }
    },

    shouldRefreshForError(error: ApiErrorPayload) {
      return this.isTokenExpiredError(error)
    },

    hasRole(role: AuthRoleKey) {
      return this.roles.includes(role)
    },

    canScope(scope: AuthScopeCode) {
      return this.scopes.includes(scope)
    },

    can(requirement: AuthRequirement = {}) {
      if (requirement.adminBoundaryPolicy === AdminBoundaryPolicy.Public) {
        return true
      }

      const boundaryRequirement = requirement.adminBoundaryPolicy
        ? ADMIN_BOUNDARY_REQUIREMENTS[requirement.adminBoundaryPolicy]
        : undefined
      const mode = requirement.permissionMode ?? PermissionMode.All
      if (boundaryRequirement) {
        const boundaryChecks = [
          ...(boundaryRequirement.requiredRoles ?? []).map((role) =>
            this.hasRole(role),
          ),
          ...(boundaryRequirement.requiredScopes ?? []).map((scope) =>
            this.canScope(scope),
          ),
        ]

        if (!boundaryChecks.every(Boolean)) {
          return false
        }
      }

      const roleChecks = (requirement.requiredRoles ?? []).map((role) =>
        this.hasRole(role),
      )
      const scopeChecks = (requirement.requiredScopes ?? []).map((scope) =>
        this.canScope(scope),
      )
      const checks = [...roleChecks, ...scopeChecks]

      if (!checks.length) {
        return true
      }

      return mode === PermissionMode.Any
        ? checks.some(Boolean)
        : checks.every(Boolean)
    },

    canNavigate(item: AppNavItem) {
      if (item.disabled) {
        return false
      }

      if (item.requiresAuth && !this.isAuthenticated) {
        return false
      }

      return this.can(item)
    },

    filterNavigationItems(items: AppNavItem[]) {
      return items.filter((item) => this.canNavigate(item))
    },

    isExpired(expiresAt: number) {
      return expiresAt <= Date.now() + AUTH_REFRESH_SKEW_MS
    },

    isHardLogoutError(errorCode?: string) {
      return (
        errorCode === AuthErrorCode.TokenRevoked ||
        errorCode === AuthErrorCode.TokenReused ||
        errorCode === AuthErrorCode.TokenInvalid
      )
    },

    isTokenExpiredError(error: ApiErrorPayload) {
      return (
        error.statusCode === 401 &&
        error.errorCode === AuthErrorCode.TokenExpired
      )
    },
  },
})
