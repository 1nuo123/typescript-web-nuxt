import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import frameworkMiddleware from '~/middleware/framework.global'
import {
  AdminBoundaryPolicy,
  AuthRole,
  AuthScope,
  AuthSessionStatus,
} from '~/types/auth'
import { RuntimeFeatureFlag } from '~/types/app'
import {
  ADMIN_ROUTE_PREFIX,
  LOGIN_ROUTE,
  PUBLIC_HOME_ROUTE,
} from '~/types/routes'

const navigateToMock = vi.hoisted(() => vi.fn((target: unknown) => target))

mockNuxtImport('navigateTo', () => navigateToMock)

const protectedRoute = {
  fullPath: ADMIN_ROUTE_PREFIX,
  path: ADMIN_ROUTE_PREFIX,
  meta: {
    requiresAuth: true,
    requiredRoles: [AuthRole.Admin],
    requiredScopes: [AuthScope.AuthRead],
    adminBoundaryPolicy: AdminBoundaryPolicy.BusinessAdmin,
  },
}
const protectedRouteWithRedirect = {
  fullPath: '/admin/ops/tasks',
  path: '/admin/ops/tasks',
  meta: {
    requiresAuth: true,
    redirectTo: LOGIN_ROUTE,
    requiredRoles: [AuthRole.Admin],
    requiredScopes: [AuthScope.SystemRead],
    adminBoundaryPolicy: AdminBoundaryPolicy.OpsOnly,
  },
}
const opsRoute = {
  fullPath: '/admin/ops/tasks',
  path: '/admin/ops/tasks',
  meta: {
    requiresAuth: true,
    redirectTo: LOGIN_ROUTE,
    requiredRoles: [AuthRole.Admin],
    requiredScopes: [AuthScope.SystemRead],
    adminBoundaryPolicy: AdminBoundaryPolicy.OpsOnly,
    requiredRuntimeFlag: RuntimeFeatureFlag.AdminOps,
  },
}
const guestOnlyRoute = {
  fullPath: LOGIN_ROUTE,
  path: LOGIN_ROUTE,
  meta: {
    guestOnly: true,
  },
}
const adminRouteWithoutMeta = {
  fullPath: '/admin/untyped',
  path: '/admin/untyped',
  meta: {},
}

describe('framework route middleware', () => {
  afterEach(() => {
    useRuntimeConfig().public[RuntimeFeatureFlag.AdminOps] = false
    useAuthStore().$reset()
    navigateToMock.mockClear()
  })

  it('allows authenticated admins through protected route meta', async () => {
    const authStore = useAuthStore()
    authStore.initialized = true
    authStore.status = AuthSessionStatus.Authenticated
    authStore.principal = {
      kind: 'authenticated_principal',
      subject_id: 'subject-1',
      username: 'admin',
      roles: [AuthRole.Admin],
      scopes: [AuthScope.AuthRead],
      is_admin: true,
    }

    await expect(
      Promise.resolve().then(() =>
        frameworkMiddleware(protectedRoute as never, {} as never),
      ),
    ).resolves.toBeUndefined()
  })

  it('rejects authenticated users without required admin scopes', async () => {
    const authStore = useAuthStore()
    authStore.initialized = true
    authStore.status = AuthSessionStatus.Authenticated
    authStore.principal = {
      kind: 'authenticated_principal',
      subject_id: 'subject-2',
      username: 'viewer',
      roles: [AuthRole.Admin],
      scopes: [],
      is_admin: true,
    }

    await expect(
      Promise.resolve().then(() =>
        frameworkMiddleware(protectedRoute as never, {} as never),
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it('redirects guest-only routes away from authenticated sessions', async () => {
    const authStore = useAuthStore()
    authStore.initialized = true
    authStore.status = AuthSessionStatus.Authenticated
    authStore.principal = {
      kind: 'authenticated_principal',
      subject_id: 'subject-3',
      username: 'admin',
      roles: [AuthRole.Admin],
      scopes: [AuthScope.AuthRead],
      is_admin: true,
    }

    await frameworkMiddleware(guestOnlyRoute as never, {} as never)

    expect(navigateToMock).toHaveBeenCalledWith(ADMIN_ROUTE_PREFIX)
  })

  it('redirects authenticated non-admins away from guest-only routes to home', async () => {
    const authStore = useAuthStore()
    authStore.initialized = true
    authStore.status = AuthSessionStatus.Authenticated
    authStore.principal = {
      kind: 'authenticated_principal',
      subject_id: 'subject-5',
      username: 'user',
      roles: [],
      scopes: [],
      is_admin: false,
    }

    await frameworkMiddleware(guestOnlyRoute as never, {} as never)

    expect(navigateToMock).toHaveBeenCalledWith(PUBLIC_HOME_ROUTE)
  })

  it('redirects anonymous protected routes to configured redirect targets', async () => {
    useRuntimeConfig().public[RuntimeFeatureFlag.AdminOps] = true

    const authStore = useAuthStore()
    authStore.initialized = true
    authStore.clearSession(AuthSessionStatus.Anonymous)

    await frameworkMiddleware(protectedRouteWithRedirect as never, {} as never)

    expect(navigateToMock).toHaveBeenCalledWith({
      path: LOGIN_ROUTE,
      query: {
        redirect: '/admin/ops/tasks',
      },
    })
  })

  it('protects admin paths even when page meta forgets requiresAuth', async () => {
    const authStore = useAuthStore()
    authStore.initialized = true
    authStore.clearSession(AuthSessionStatus.Anonymous)

    await frameworkMiddleware(adminRouteWithoutMeta as never, {} as never)

    expect(navigateToMock).toHaveBeenCalledWith({
      path: LOGIN_ROUTE,
      query: {
        redirect: '/admin/untyped',
      },
    })
  })

  it('rejects ops routes when the runtime feature is disabled', async () => {
    const authStore = useAuthStore()
    authStore.initialized = true
    authStore.status = AuthSessionStatus.Authenticated
    authStore.principal = {
      kind: 'authenticated_principal',
      subject_id: 'subject-4',
      username: 'ops',
      roles: [AuthRole.Admin],
      scopes: [AuthScope.SystemRead],
      is_admin: true,
    }

    await expect(
      Promise.resolve().then(() =>
        frameworkMiddleware(opsRoute as never, {} as never),
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: '当前环境未启用该后台功能。',
    })
  })

  it('allows ops routes only when the runtime feature and system scope are present', async () => {
    useRuntimeConfig().public[RuntimeFeatureFlag.AdminOps] = true

    const authStore = useAuthStore()
    authStore.initialized = true
    authStore.status = AuthSessionStatus.Authenticated
    authStore.principal = {
      kind: 'authenticated_principal',
      subject_id: 'subject-4',
      username: 'ops',
      roles: [AuthRole.Admin],
      scopes: [AuthScope.SystemRead],
      is_admin: true,
    }

    await expect(
      Promise.resolve().then(() =>
        frameworkMiddleware(opsRoute as never, {} as never),
      ),
    ).resolves.toBeUndefined()
  })
})
