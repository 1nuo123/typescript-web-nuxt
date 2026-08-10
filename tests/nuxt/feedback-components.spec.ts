import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AppAlert from '~/components/feedback/AppAlert.vue'
import AppSkeleton from '~/components/feedback/AppSkeleton.vue'
import EmptyState from '~/components/feedback/EmptyState.vue'

describe('feedback components', () => {
  it('renders alert content and variant state', async () => {
    const component = await mountSuspended(AppAlert, {
      props: {
        variant: 'warning',
        title: '提示',
        description: '请检查当前状态',
      },
      slots: {
        default: () => '操作',
      },
    })

    expect(component.attributes('role')).toBe('status')
    expect(component.classes()).toContain('app-alert--warning')
    expect(component.text()).toContain('提示')
    expect(component.text()).toContain('操作')
  })

  it('uses assertive semantics for danger alerts', async () => {
    const component = await mountSuspended(AppAlert, {
      props: {
        variant: 'danger',
        title: '错误',
      },
    })

    expect(component.attributes('role')).toBe('alert')
  })

  it('renders skeleton dimensions and shape', async () => {
    const component = await mountSuspended(AppSkeleton, {
      props: {
        width: '12rem',
        height: '4rem',
        shape: 'block',
      },
    })

    expect(component.classes()).toContain('app-skeleton--block')
    expect(component.attributes('aria-hidden')).toBe('true')
    expect(component.attributes('style')).toContain('width: 12rem')
    expect(component.attributes('style')).toContain('height: 4rem')
  })

  it('renders empty state actions without business copy', async () => {
    const component = await mountSuspended(EmptyState, {
      props: {
        eyebrow: '状态',
        title: '暂无内容',
        description: '中立的空状态。',
      },
      slots: {
        default: () => '重置',
      },
    })

    expect(component.get('h1').text()).toBe('暂无内容')
    expect(component.text()).toContain('中立的空状态。')
    expect(component.text()).toContain('重置')
  })
})
