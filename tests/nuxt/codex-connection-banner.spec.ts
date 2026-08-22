import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import CodexConnectionBanner from '~/components/codex/CodexConnectionBanner.vue'
import { CodexRealtimeConnectionStatus } from '~/types/codex-realtime'

describe('Codex connection banner', () => {
  it('keeps the authority recovery message in a fixed overlay', async () => {
    const component = await mountSuspended(CodexConnectionBanner, {
      props: { status: CodexRealtimeConnectionStatus.Resyncing },
    })

    expect(component.get('[role="status"]').classes()).toContain('fixed')
    expect(component.text()).toContain('正在同步权威状态')
    component.unmount()
  })
})
