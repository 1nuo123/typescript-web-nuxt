import { AdminBoundaryPolicy } from '~/types/auth'
import {
  ADMIN_ROUTE_PREFIX,
  LOGIN_ROUTE,
  PUBLIC_HOME_ROUTE,
} from '~/types/routes'

export default defineNuxtRouteMiddleware(async (to) => {
  if (typeof to.meta.title === 'string') {
    useHead({
      title: to.meta.title,
    })
  }

  const authStore = useAuthStore()
  const isAdminRoute =
    to.path === ADMIN_ROUTE_PREFIX ||
    to.path.startsWith(`${ADMIN_ROUTE_PREFIX}/`)
  const requiresAuth = Boolean(to.meta.requiresAuth || isAdminRoute)
  const adminBoundaryPolicy =
    to.meta.adminBoundaryPolicy ??
    (isAdminRoute && !to.meta.requiredRoles && !to.meta.requiredScopes
      ? AdminBoundaryPolicy.BusinessAdmin
      : undefined)

  if (to.meta.guestOnly) {
    await authStore.initSession()

    if (authStore.isAuthenticated) {
      const authenticatedRedirect = authStore.isAdmin
        ? ADMIN_ROUTE_PREFIX
        : PUBLIC_HOME_ROUTE

      return navigateTo(String(to.meta.redirectTo || authenticatedRedirect))
    }
  }

  if (!requiresAuth) {
    return
  }

  if (to.meta.requiredRuntimeFlag) {
    const runtimeConfig = useRuntimeConfig()
    const publicRuntimeConfig = runtimeConfig.public as Record<string, unknown>

    if (!publicRuntimeConfig[to.meta.requiredRuntimeFlag]) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Not Found',
        message: '当前环境未启用该后台功能。',
      })
    }
  }

  // Browser refresh relies on the browser Origin header. Do not run the
  // cookie-backed refresh flow during Nuxt SSR, where that header is absent.
  if (import.meta.server) {
    return
  }

  await authStore.initSession()

  if (!authStore.isAuthenticated) {
    return navigateTo({
      path: String(to.meta.redirectTo || LOGIN_ROUTE),
      query: { redirect: to.fullPath },
    })
  }

  const allowed = authStore.can({
    requiredRoles: to.meta.requiredRoles,
    requiredScopes: to.meta.requiredScopes,
    permissionMode: to.meta.permissionMode,
    adminBoundaryPolicy,
  })

  if (!allowed) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: '当前账号没有访问该页面所需的后台权限。',
    })
  }
})
