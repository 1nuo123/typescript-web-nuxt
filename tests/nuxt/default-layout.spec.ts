import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import DefaultLayout from '~/layouts/default.vue'
import { RuntimeFeatureFlag } from '~/types/app'
import { AuthRole, AuthScope, AuthSessionStatus } from '~/types/auth'
import {
  ADMIN_ROUTE_PREFIX,
  LOGIN_ROUTE,
  PUBLIC_HOME_ROUTE,
} from '~/types/routes'
import { APP_NAVIGATION_ITEMS } from '~/utils/navigation'

const PAGE_CONTENT = '页面内容'
const routeState = vi.hoisted(() => ({ path: '/' }))
const navigateToMock = vi.hoisted(() => vi.fn((target: unknown) => target))

mockNuxtImport('useRoute', () => () => routeState)
mockNuxtImport('navigateTo', () => navigateToMock)

const stubMatchMedia = () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

describe('default layout navigation permissions', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useRuntimeConfig().public[RuntimeFeatureFlag.AdminOps] = false
    useAuthStore().$reset()
    navigateToMock.mockClear()
  })

  it('filters business and ops navigation by authenticated principal scopes', async () => {
    stubMatchMedia()

    routeState.path = PUBLIC_HOME_ROUTE
    const anonymousLayout = await mountSuspended(DefaultLayout, {
      slots: {
        default: () => PAGE_CONTENT,
      },
    })

    expect(anonymousLayout.text()).toContain('首页')
    expect(anonymousLayout.text()).not.toContain('身份管理')
    expect(anonymousLayout.text()).not.toContain('运维控制面')
    anonymousLayout.unmount()

    const authStore = useAuthStore()
    authStore.status = AuthSessionStatus.Authenticated
    authStore.initialized = true
    authStore.accessToken = 'access-token'
    authStore.principal = {
      kind: 'authenticated_principal',
      subject_id: 'subject-1',
      username: 'admin',
      roles: [AuthRole.Admin],
      scopes: [AuthScope.AuthRead],
      is_admin: true,
    }

    routeState.path = ADMIN_ROUTE_PREFIX
    const businessLayout = await mountSuspended(DefaultLayout, {
      slots: {
        default: () => PAGE_CONTENT,
      },
    })

    expect(businessLayout.text()).toContain('身份管理')
    expect(businessLayout.text()).toContain('业务审计')
    expect(businessLayout.text()).not.toContain('运维控制面')
    businessLayout.unmount()

    authStore.principal = {
      kind: 'authenticated_principal',
      subject_id: 'subject-1',
      username: 'admin',
      roles: [AuthRole.Admin],
      scopes: [AuthScope.AuthRead, AuthScope.SystemRead],
      is_admin: true,
    }

    const opsLayout = await mountSuspended(DefaultLayout, {
      slots: {
        default: () => PAGE_CONTENT,
      },
    })

    expect(opsLayout.text()).not.toContain('运维控制面')
    opsLayout.unmount()

    useRuntimeConfig().public[RuntimeFeatureFlag.AdminOps] = true

    const enabledOpsLayout = await mountSuspended(DefaultLayout, {
      slots: {
        default: () => PAGE_CONTENT,
      },
    })

    expect(enabledOpsLayout.text()).toContain('运维控制面')
    enabledOpsLayout.unmount()
  })

  it('loads navigation items from app config', () => {
    expect(useAppConfig().navigation.items).toEqual(APP_NAVIGATION_ITEMS)
  })

  it('shows logout only in authenticated admin routes and returns to login', async () => {
    stubMatchMedia()

    const authStore = useAuthStore()
    authStore.status = AuthSessionStatus.Authenticated
    authStore.initialized = true
    authStore.accessToken = 'access-token'
    authStore.principal = {
      kind: 'authenticated_principal',
      subject_id: 'subject-1',
      username: 'admin',
      roles: [AuthRole.Admin],
      scopes: [AuthScope.AuthRead],
      is_admin: true,
    }

    routeState.path = ADMIN_ROUTE_PREFIX
    const layout = await mountSuspended(DefaultLayout, {
      slots: {
        default: () => PAGE_CONTENT,
      },
    })

    const logoutButton = layout.get('button[title="退出"]')
    await logoutButton.trigger('click')
    await flushPromises()

    expect(authStore.status).toBe(AuthSessionStatus.Anonymous)
    expect(navigateToMock).toHaveBeenCalledWith(LOGIN_ROUTE)
    layout.unmount()
  })
})
