import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import CodexCommandOutput from '~/components/codex/CodexCommandOutput.vue'
import CodexPlanCard from '~/components/codex/CodexPlanCard.vue'
import CodexWorkingIndicator from '~/components/codex/CodexWorkingIndicator.vue'
import {
  CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
  CodexTimelineItemKind,
  CodexTimelineItemStatus,
  type CodexCommandTimelineItem,
  type CodexPlanTimelineItem,
} from '~/types/codex-item'

const command = (
  status = CodexTimelineItemStatus.Streaming,
  output = '',
  exitCode: number | null = null,
  id = 'command-1',
): CodexCommandTimelineItem => ({
  header: {
    item_id: id,
    thread_id: 'thread-1',
    turn_id: 'turn-1',
    detail_kind: CodexTimelineItemKind.Command,
    schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
    status,
  },
  detail: {
    kind: CodexTimelineItemKind.Command,
    schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
    command: `python ${id}.py`,
    output,
    exit_code: exitCode,
  },
})

describe('Codex execution disclosures', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useCodexUiStore().clearUi()
  })

  it.each([
    ['selection', false],
    ['selection', true],
    ['output', false],
    ['output', true],
  ] as const)(
    'discards stale copy feedback after %s changes (failure=%s)',
    async (change, fail) => {
      let resolve!: () => void
      let reject!: (reason: Error) => void
      const writeText = vi.fn(
        () =>
          new Promise<void>((success, failure) => {
            resolve = success
            reject = failure
          }),
      )
      vi.stubGlobal('navigator', { clipboard: { writeText } })
      const component = await mountSuspended(CodexCommandOutput, {
        props: {
          item: command(
            CodexTimelineItemStatus.Completed,
            'original output',
            0,
          ),
        },
      })
      await component.get('footer button').trigger('click')
      expect(writeText).toHaveBeenCalledWith('original output')
      await component.setProps({
        item: command(
          CodexTimelineItemStatus.Completed,
          'updated output',
          0,
          change === 'selection' ? 'command-2' : 'command-1',
        ),
      })
      if (fail) reject(new Error('clipboard denied'))
      else resolve()
      await flushPromises()
      expect(component.get('[role="status"]').text()).toBe('')
      expect(component.get('pre').text()).toBe('updated output')
      component.unmount()
    },
  )

  it('retains timeline disclosure across remounts without sharing it with Context or other threads', async () => {
    const item = command()
    const first = await mountSuspended(CodexCommandOutput, {
      props: { item, persistExpansion: true },
    })
    ;(first.get('details').element as HTMLDetailsElement).open = true
    await first.get('details').trigger('toggle')
    first.unmount()
    const remounted = await mountSuspended(CodexCommandOutput, {
      props: { item, persistExpansion: true },
    })
    expect((remounted.get('details').element as HTMLDetailsElement).open).toBe(
      true,
    )
    remounted.unmount()
    const context = await mountSuspended(CodexCommandOutput, {
      props: { item },
    })
    expect((context.get('details').element as HTMLDetailsElement).open).toBe(
      false,
    )
    context.unmount()
    const otherThread = await mountSuspended(CodexCommandOutput, {
      props: {
        item: { ...item, header: { ...item.header, thread_id: 'thread-2' } },
        persistExpansion: true,
      },
    })
    expect(
      (otherThread.get('details').element as HTMLDetailsElement).open,
    ).toBe(false)
    otherThread.unmount()
    useCodexUiStore().clearUi()
    expect(useCodexUiStore().itemDisclosureOpen('thread-1', 'command-1')).toBe(
      false,
    )
  })

  it('retains user expansion across partial output and terminal updates', async () => {
    const component = await mountSuspended(CodexCommandOutput, {
      props: { item: command() },
    })
    const disclosure = component.get('details').element as HTMLDetailsElement
    expect(disclosure.open).toBe(false)
    expect(component.get('summary').text()).toContain('执行中')
    expect(component.get('pre').text()).toBe('等待输出…')
    disclosure.open = true
    await component.get('details').trigger('toggle')
    await component.setProps({
      item: command(CodexTimelineItemStatus.Streaming, 'step 1'),
    })
    expect(disclosure.open).toBe(true)
    expect(component.get('pre').text()).toBe('step 1')
    await component.setProps({
      item: command(CodexTimelineItemStatus.Completed, 'step 1\nfinished', 0),
    })
    expect(disclosure.open).toBe(true)
    expect(component.get('summary').text()).toContain('执行完成')
    expect(component.get('summary').text()).toContain('退出码 0')
    disclosure.open = false
    await component.get('details').trigger('toggle')
    await component.setProps({
      item: command(CodexTimelineItemStatus.Completed, 'final authority', 0),
    })
    expect(disclosure.open).toBe(false)
    component.unmount()
  })

  it.each([
    [CodexTimelineItemStatus.Failed, null],
    [CodexTimelineItemStatus.Completed, 1],
    [CodexTimelineItemStatus.Streaming, 2],
  ] as const)(
    'shows failure from status %s or exit code %s without hiding empty output',
    async (status, exitCode) => {
      const component = await mountSuspended(CodexCommandOutput, {
        props: { item: command(status, '', exitCode) },
      })
      expect(component.get('summary').text()).toContain('执行失败')
      expect(component.get('pre').text()).toBe('执行失败，无输出')
      expect(component.get('summary').find('.animate-spin').exists()).toBe(
        false,
      )
      expect(
        component.get('footer button').attributes('disabled'),
      ).toBeDefined()
      component.unmount()
    },
  )

  it('resets disclosure when selecting a different command and does not reuse its output', async () => {
    const component = await mountSuspended(CodexCommandOutput, {
      props: {
        item: command(CodexTimelineItemStatus.Completed, 'first output', 0),
      },
    })
    ;(component.get('details').element as HTMLDetailsElement).open = true
    await component.setProps({
      item: command(
        CodexTimelineItemStatus.Completed,
        'second output',
        0,
        'command-2',
      ),
    })
    expect((component.get('details').element as HTMLDetailsElement).open).toBe(
      false,
    )
    expect(component.get('pre').text()).toBe('second output')
    expect(component.text()).not.toContain('first output')
    component.unmount()
  })

  it('summarizes actual plan steps and preserves a collapsed plan on progress updates', async () => {
    const item: CodexPlanTimelineItem = {
      header: { ...command().header, detail_kind: CodexTimelineItemKind.Plan },
      detail: {
        kind: CodexTimelineItemKind.Plan,
        schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
        explanation: '验证实现',
        steps: [
          { step: '检查', status: 'completed' },
          { step: '测试', status: 'in_progress' },
        ],
      },
    }
    const component = await mountSuspended(CodexPlanCard, { props: { item } })
    expect(component.get('summary').text()).toContain('1/2 已完成')
    expect(component.text()).toContain('进行中')
    const disclosure = component.get('details').element as HTMLDetailsElement
    disclosure.open = false
    await component.get('details').trigger('toggle')
    await component.setProps({
      item: {
        ...item,
        detail: {
          ...item.detail,
          steps: item.detail.steps.map((step) => ({
            ...step,
            status: 'completed',
          })),
        },
      },
    })
    expect(component.get('summary').text()).toContain('2/2 已完成')
    expect(disclosure.open).toBe(false)
    component.unmount()
    const remounted = await mountSuspended(CodexPlanCard, { props: { item } })
    expect((remounted.get('details').element as HTMLDetailsElement).open).toBe(
      false,
    )
    remounted.unmount()
  })

  it.each(['正在准备', '等待审批', '核对会话状态', '正在执行'])(
    'displays the provided runtime stage %s without invented reasoning or timing',
    async (label) => {
      const component = await mountSuspended(CodexWorkingIndicator, {
        props: { label },
      })
      expect(component.get('[role="status"]').text()).toBe(label)
      expect(component.text()).not.toMatch(/思考|用时|秒|token/)
      component.unmount()
    },
  )
})
