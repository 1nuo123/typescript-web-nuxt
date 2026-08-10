import { afterEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import BaseModal from '~/components/base/BaseModal.vue'

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
})
