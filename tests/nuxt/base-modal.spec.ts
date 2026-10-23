import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import BaseModal from '~/components/base/BaseModal.vue'
import { UI_SURFACE_CLASS } from '~/utils/ui-surface'

describe('BaseModal', () => {
  afterEach(() => {
    document.body.querySelectorAll('.base-modal').forEach((element) => {
      element.remove()
    })
    document.body.style.overflow = ''
  })

  it('renders dialog content when open', async () => {
    const component = await mountSuspended(BaseModal, {
      props: {
        open: true,
        title: '弹窗标题',
        description: '弹窗描述',
      },
      slots: {
        default: () => '弹窗内容',
      },
    })

    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')

    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(document.body.textContent).toContain('弹窗标题')
    expect(document.body.textContent).toContain('弹窗内容')
    expect(document.body.style.overflow).toBe('hidden')

    component.unmount()
    await nextTick()

    expect(document.body.style.overflow).toBe('')
  })

  it('inherits an explicit layout surface through Teleport without affecting other dialogs', async () => {
    const themed = await mountSuspended(BaseModal, {
      props: { open: true, title: 'Scoped dialog' },
      global: { provide: { [UI_SURFACE_CLASS as symbol]: 'codex-surface' } },
    })
    expect(
      document.body
        .querySelector('[role="dialog"]')
        ?.classList.contains('codex-surface'),
    ).toBe(true)
    themed.unmount()
    await nextTick()

    const unscoped = await mountSuspended(BaseModal, {
      props: { open: true, title: 'Default dialog' },
    })
    expect(
      document.body
        .querySelector('[role="dialog"]')
        ?.classList.contains('codex-surface'),
    ).toBe(false)
    unscoped.unmount()
  })

  it('emits close from the backdrop', async () => {
    const component = await mountSuspended(BaseModal, {
      props: {
        open: true,
      },
    })

    const backdrop = document.body.querySelector<HTMLButtonElement>(
      '.base-modal__backdrop',
    )

    if (!backdrop) {
      throw new Error('预期弹窗背景层已渲染')
    }

    backdrop.click()
    await nextTick()

    expect(component.emitted('close')).toHaveLength(1)

    component.unmount()
  })

  it('closes with Escape and restores focus to the trigger', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = '打开弹窗'
    document.body.append(trigger)
    trigger.focus()

    const component = await mountSuspended(BaseModal, {
      props: {
        open: true,
        title: '可访问弹窗',
      },
      slots: {
        default: '<input aria-label="弹窗输入" />',
      },
    })
    await nextTick()
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')
    if (!dialog) throw new Error('预期弹窗已经渲染。')

    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(component.emitted('close')).toHaveLength(1)

    await component.setProps({ open: false })
    await nextTick()
    expect(document.activeElement).toBe(trigger)

    component.unmount()
    trigger.remove()
  })

  it('keeps Tab focus inside the dialog', async () => {
    const component = await mountSuspended(BaseModal, {
      props: {
        open: true,
        title: '焦点弹窗',
      },
      slots: {
        default:
          '<button id="first-content-action">第一项</button><button id="last-content-action">最后一项</button>',
      },
    })
    await nextTick()
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')
    const panel = dialog?.querySelector<HTMLElement>('section')
    const focusable = Array.from(
      panel?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [],
    )
    const first = focusable.at(0)
    const last = focusable.at(-1)
    if (!dialog || !panel || !first || !last) {
      throw new Error('预期弹窗面板包含可聚焦控件。')
    }

    last.focus()
    dialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
    )
    expect(document.activeElement).toBe(first)

    first.focus()
    dialog.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
      }),
    )
    expect(document.activeElement).toBe(last)

    component.unmount()
  })
})
