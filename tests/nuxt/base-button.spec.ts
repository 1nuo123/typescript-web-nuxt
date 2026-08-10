import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import BaseButton from '~/components/base/BaseButton.vue'

describe('BaseButton', () => {
  it('renders slot content and variant class', async () => {
    const component = await mountSuspended(BaseButton, {
      props: {
        variant: 'secondary',
      },
      slots: {
        default: () => '继续',
      },
    })

    expect(component.text()).toContain('继续')
    expect(component.classes()).toContain('base-button--secondary')
  })

  it('disables interaction while loading', async () => {
    const component = await mountSuspended(BaseButton, {
      props: {
        loading: true,
      },
    })

    expect(component.attributes('disabled')).toBeDefined()
    expect(component.attributes('aria-busy')).toBe('true')
  })

  it('supports stable icon-only sizing', async () => {
    const component = await mountSuspended(BaseButton, {
      props: {
        icon: true,
        size: 'sm',
        'aria-label': '图标操作',
      },
      slots: {
        default: () => 'I',
      },
    })

    expect(component.classes()).toContain('base-button--icon')
    expect(component.attributes('aria-label')).toBe('图标操作')
  })
})
