import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import HomeTopNav from '~/components/home/HomeTopNav.vue'
import { AuthSessionStatus } from '~/types/auth'
import { ACCOUNT_ROUTE, LOGIN_ROUTE, PUBLIC_HOME_ROUTE } from '~/types/routes'

const navigateToMock = vi.hoisted(() => vi.fn((target: unknown) => target))
const SCROLLED_BORDER_CLASS = 'border-line'
const SCROLLED_SHADOW_CLASS = 'shadow-card'

mockNuxtImport('navigateTo', () => navigateToMock)

const setScrollY = (value: number) => {
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    writable: true,
    value,
  })
}

describe('home top nav', () => {
  afterEach(() => {
    navigateToMock.mockClear()
    useAuthStore().$reset()
    setScrollY(0)
  })

  it('shows the login action for anonymous sessions', async () => {
    const wrapper = await mountSuspended(HomeTopNav)

    await wrapper.get('button[title="登录"]').trigger('click')

    expect(navigateToMock).toHaveBeenCalledWith(LOGIN_ROUTE)
    wrapper.unmount()
  })

  it('shows the authenticated user menu and routes to account', async () => {
    const authStore = useAuthStore()
    authStore.initialized = true
    authStore.status = AuthSessionStatus.Authenticated
    authStore.principal = {
      kind: 'authenticated_principal',
      subject_id: 'subject-1',
      username: 'admin',
      roles: [],
      scopes: [],
      is_admin: false,
    }

    const wrapper = await mountSuspended(HomeTopNav)

    await wrapper.get('.home-user-menu__trigger').trigger('click')
    await wrapper.get('button[title="个人中心"]').trigger('click')

    expect(navigateToMock).toHaveBeenCalledWith(ACCOUNT_ROUTE)
    wrapper.unmount()
  })

  it('logs out authenticated users and returns home', async () => {
    const authStore = useAuthStore()
    authStore.initialized = true
    authStore.status = AuthSessionStatus.Authenticated
    authStore.principal = {
      kind: 'authenticated_principal',
      subject_id: 'subject-1',
      username: 'admin',
      roles: [],
      scopes: [],
      is_admin: false,
    }

    const wrapper = await mountSuspended(HomeTopNav)

    await wrapper.get('.home-user-menu__trigger').trigger('click')
    await wrapper.get('button[title="退出登录"]').trigger('click')
    await flushPromises()

    expect(authStore.status).toBe(AuthSessionStatus.Anonymous)
    expect(navigateToMock).toHaveBeenCalledWith(PUBLIC_HOME_ROUTE)
    wrapper.unmount()
  })

  it('switches to the compact sticky state after scrolling', async () => {
    setScrollY(0)
    const wrapper = await mountSuspended(HomeTopNav)

    expect(wrapper.classes()).not.toContain(SCROLLED_BORDER_CLASS)
    expect(wrapper.classes()).not.toContain(SCROLLED_SHADOW_CLASS)

    setScrollY(24)
    window.dispatchEvent(new Event('scroll'))
    await new Promise((resolve) => window.requestAnimationFrame(resolve))
    await flushPromises()

    expect(wrapper.classes()).toContain(SCROLLED_BORDER_CLASS)
    expect(wrapper.classes()).toContain(SCROLLED_SHADOW_CLASS)
    wrapper.unmount()
  })
})
