import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import frameworkMiddleware from '~/middleware/framework.global'
import { RuntimeFeatureFlag } from '~/types/app'
import { AuthScope, AuthSessionStatus } from '~/types/auth'
import { LOGIN_ROUTE } from '~/types/routes'

const navigateToMock = vi.hoisted(() => vi.fn((target: unknown) => target))
mockNuxtImport('navigateTo', () => navigateToMock)

const codexRoute = {
  fullPath: '/codex/tasks',
  path: '/codex/tasks',
  meta: {
    requiresAuth: true,
    redirectTo: LOGIN_ROUTE,
    requiredScopes: [AuthScope.CodexRead],
    requiredRuntimeFlag: RuntimeFeatureFlag.Codex,
  },
}

describe('Codex authentication boundary', () => {
  afterEach(() => {
    useRuntimeConfig().public.codexFeatureEnabled = false
    useAuthStore().$reset()
    navigateToMock.mockClear()
  })

  it('hides Codex routes when the runtime feature is disabled', async () => {
    await expect(
      Promise.resolve().then(() =>
        frameworkMiddleware(codexRoute as never, {} as never),
      ),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('allows only authenticated subjects carrying codex:read', async () => {
    useRuntimeConfig().public.codexFeatureEnabled = true
    const authStore = useAuthStore()
    authStore.initialized = true
    authStore.status = AuthSessionStatus.Authenticated
    authStore.principal = {
      kind: 'authenticated_principal',
      subject_id: 'subject-1',
      username: 'codex-user',
      roles: [],
      scopes: [AuthScope.CodexRead],
      is_admin: false,
    }

    await expect(
      Promise.resolve().then(() =>
        frameworkMiddleware(codexRoute as never, {} as never),
      ),
    ).resolves.toBeUndefined()
  })

  it('rejects authenticated subjects without Codex ownership scope', async () => {
    useRuntimeConfig().public.codexFeatureEnabled = true
    const authStore = useAuthStore()
    authStore.initialized = true
    authStore.status = AuthSessionStatus.Authenticated
    authStore.principal = {
      kind: 'authenticated_principal',
      subject_id: 'subject-2',
      username: 'viewer',
      roles: [],
      scopes: [],
      is_admin: false,
    }

    await expect(
      Promise.resolve().then(() =>
        frameworkMiddleware(codexRoute as never, {} as never),
      ),
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})
