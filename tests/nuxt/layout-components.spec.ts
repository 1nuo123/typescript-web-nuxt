import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AppHeader from '~/components/layout/AppHeader.vue'
import AppSidebar from '~/components/layout/AppSidebar.vue'
import PageContainer from '~/components/layout/PageContainer.vue'

const stubMatchMedia = (matches: boolean) => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches,
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

describe('layout components', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document
      .querySelectorAll('[data-test-opener]')
      .forEach((element) => element.remove())
  })

  it('renders header navigation and emits menu toggles', async () => {
    const component = await mountSuspended(AppHeader, {
      props: {
        title: '应用外壳',
        items: [
          { label: '首页', to: '/', exact: true },
          { label: '已禁用', to: '/disabled', disabled: true },
        ],
      },
    })

    const menu = component.get('.app-header__menu')

    expect(component.text()).toContain('应用外壳')
    expect(component.text()).toContain('首页')
    expect(menu.attributes('aria-label')).toBe('打开导航')

    await menu.trigger('click')

    expect(component.emitted('toggleNavigation')).toHaveLength(1)

    await component.setProps({ navigationOpen: true })

    expect(component.get('.app-header__menu').attributes('aria-label')).toBe(
      '关闭导航',
    )
  })

  it('hides compact sidebar from assistive navigation when closed', async () => {
    stubMatchMedia(true)

    const component = await mountSuspended(AppSidebar, {
      props: {
        open: false,
        items: [{ label: '首页', to: '/', exact: true }],
      },
    })

    await nextTick()

    expect(component.attributes('aria-hidden')).toBe('true')
    expect(component.attributes('inert')).toBeDefined()

    await component.setProps({ open: true })
    await nextTick()

    expect(component.attributes('aria-hidden')).toBeUndefined()
    expect(component.attributes('inert')).toBeUndefined()

    await component.get('.app-sidebar__link').trigger('click')

    expect(component.emitted('close')).toHaveLength(1)
  })

  it('closes compact sidebar on global escape', async () => {
    stubMatchMedia(true)

    const component = await mountSuspended(AppSidebar, {
      props: {
        open: true,
        items: [{ label: '首页', to: '/', exact: true }],
      },
    })

    await nextTick()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(component.emitted('close')).toHaveLength(1)
  })

  it('traps compact sidebar focus and restores the opener', async () => {
    stubMatchMedia(true)
    const opener = document.createElement('button')
    opener.dataset.testOpener = 'true'
    opener.textContent = '打开导航'
    document.body.append(opener)
    opener.focus()

    const component = await mountSuspended(AppSidebar, {
      props: {
        open: false,
        items: [
          { label: '首页', to: '/', exact: true },
          { label: '设置', to: '/settings' },
        ],
      },
    })

    await nextTick()
    await component.setProps({ open: true })
    await nextTick()
    await new Promise((resolve) => window.setTimeout(resolve))

    const focusableElements = component
      .get('.app-sidebar__panel')
      .element.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]

    if (!firstElement || !lastElement) {
      throw new Error('预期侧栏内存在可聚焦元素')
    }

    const firstFocus = vi.spyOn(firstElement, 'focus')
    const openerFocus = vi.spyOn(opener, 'focus')
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(lastElement)
    await component.get('aside').trigger('keydown', { key: 'Tab' })
    expect(firstFocus).toHaveBeenCalled()

    await component.setProps({ open: false })
    await nextTick()

    expect(openerFocus).toHaveBeenCalled()
    component.unmount()
    opener.remove()
  })

  it('renders page container headings, density, and actions', async () => {
    const component = await mountSuspended(PageContainer, {
      props: {
        eyebrow: '层级',
        title: '容器',
        description: '可组合的页面外壳。',
        density: 'compact',
      },
      slots: {
        actions: () => '操作',
        default: () => '内容',
      },
    })

    expect(component.classes()).toContain('page-container--compact')
    expect(component.get('h1').text()).toBe('容器')
    expect(component.text()).toContain('操作')
    expect(component.text()).toContain('内容')
  })
})
