import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import BaseInput from '~/components/base/BaseInput.vue'

describe('BaseInput', () => {
  it('renders label, hint, and typed attributes', async () => {
    const component = await mountSuspended(BaseInput, {
      props: {
        label: '邮箱',
        hint: '请输入可联系的地址',
        name: 'email',
        type: 'email',
        autocomplete: 'email',
        placeholder: 'name@example.test',
      },
    })

    const input = component.get('input')

    expect(component.text()).toContain('邮箱')
    expect(component.text()).toContain('请输入可联系的地址')
    expect(input.attributes('name')).toBe('email')
    expect(input.attributes('type')).toBe('email')
    expect(input.attributes('autocomplete')).toBe('email')
  })

  it('emits model updates and exposes error state', async () => {
    const component = await mountSuspended(BaseInput, {
      props: {
        modelValue: '',
        error: '必填字段',
      },
    })

    const input = component.get('input')
    await input.setValue('value')

    expect(component.emitted('update:modelValue')?.at(-1)).toEqual(['value'])
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(component.text()).toContain('必填字段')
  })
})
