import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CodexCommandOutput from '~/components/codex/CodexCommandOutput.vue'
import CodexDiffView from '~/components/codex/CodexDiffView.vue'
import CodexTimelineItem from '~/components/codex/CodexTimelineItem.vue'
import CodexTimeline from '~/components/codex/CodexTimeline.vue'
import { ClientPerformanceMetric } from '~/types/app'
import { ClientPerformanceDiagnosticCollector } from '~/utils/client-performance-diagnostic'
import {
  CODEX_EXPERIENCE_FEATURE_FLAGS_LOADED_STATE_KEY,
  CODEX_EXPERIENCE_FEATURE_FLAGS_STATE_KEY,
} from '~/composables/useCodexExperienceFeatureFlags'
import type { CodexExperienceFeatureFlags } from '~/types/codex-feature-flags'
import {
  CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
  CodexDiffChangeKind,
  CodexDiffLineKind,
  CodexTimelineItemKind,
  CodexTimelineItemStatus,
  type CodexCommandTimelineItem,
  type CodexDiffFile,
  type CodexTextTimelineItem,
} from '~/types/codex-item'

const createDiffFile = (
  overrides: Partial<CodexDiffFile> = {},
): CodexDiffFile => ({
  path: 'change.ts',
  old_path: null,
  change_kind: CodexDiffChangeKind.Modified,
  binary: false,
  large: false,
  truncated: false,
  hunks: [
    {
      header: '@@ -1 +1 @@',
      old_start: 1,
      new_start: 1,
      lines: [
        {
          kind: CodexDiffLineKind.Addition,
          content: 'new line',
          old_line_number: null,
          new_line_number: 1,
        },
      ],
    },
  ],
  ...overrides,
})

describe('Codex timeline item', () => {
  beforeEach(() => {
    const runtimeConfig = useRuntimeConfig()
    runtimeConfig.public.codexPerformanceDiagnosticsEnabled = true
    runtimeConfig.public.codexPerformanceDiagnosticsSampleRate = 1
    useState<CodexExperienceFeatureFlags>(
      CODEX_EXPERIENCE_FEATURE_FLAGS_STATE_KEY,
    ).value = {
      codex_scroll_controller_v2: true,
      codex_realtime_batch_v2: false,
      codex_authority_recovery_v2: false,
    }
    useState<boolean>(CODEX_EXPERIENCE_FEATURE_FLAGS_LOADED_STATE_KEY).value =
      true
  })

  afterEach(() => {
    useNuxtApp().$codexClientPerformanceDiagnostics.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('keeps the legacy scroll path when the v2 controller is disabled', async () => {
    useState<CodexExperienceFeatureFlags>(
      CODEX_EXPERIENCE_FEATURE_FLAGS_STATE_KEY,
    ).value = {
      codex_scroll_controller_v2: false,
      codex_realtime_batch_v2: false,
      codex_authority_recovery_v2: false,
    }
    const component = await mountSuspended(CodexTimeline, {
      props: {
        threadId: 'thread-1',
        items: [
          {
            header: {
              item_id: 'item-legacy-scroll',
              thread_id: 'thread-1',
              turn_id: 'turn-1',
              detail_kind: CodexTimelineItemKind.AgentMessage,
              schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
              status: CodexTimelineItemStatus.Completed,
            },
            detail: {
              kind: CodexTimelineItemKind.AgentMessage,
              schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
              text: 'legacy',
            },
          },
        ],
      },
    })

    expect(component.find('button').exists()).toBe(false)
    component.unmount()
  })

  it('renders Markdown inside the styled DOM container', async () => {
    const component = await mountSuspended(CodexTimelineItem, {
      props: {
        item: {
          header: {
            item_id: 'item-1',
            thread_id: 'thread-1',
            turn_id: 'turn-1',
            detail_kind: CodexTimelineItemKind.AgentMessage,
            schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
            status: CodexTimelineItemStatus.Completed,
          },
          detail: {
            kind: CodexTimelineItemKind.AgentMessage,
            schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
            text: '**done**',
          },
        },
      },
    })

    const markdown = component.get('.codex-markdown')
    expect(markdown.text()).toBe('done')
    expect(markdown.classes()).toEqual(
      expect.arrayContaining([
        'break-words',
        'text-[0.9375rem]',
        'leading-7',
        'text-ink',
      ]),
    )
    component.unmount()
  })

  it('keeps long Markdown content within the timeline item', async () => {
    const component = await mountSuspended(CodexTimelineItem, {
      props: {
        item: {
          header: {
            item_id: 'item-long-markdown',
            thread_id: 'thread-1',
            turn_id: 'turn-1',
            detail_kind: CodexTimelineItemKind.AgentMessage,
            schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
            status: CodexTimelineItemStatus.Completed,
          },
          detail: {
            kind: CodexTimelineItemKind.AgentMessage,
            schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
            text: `\`${'a'.repeat(512)}\``,
          },
        },
      },
    })

    expect(component.get('article').classes()).toEqual(
      expect.arrayContaining(['min-w-0', 'max-w-full', 'overflow-hidden']),
    )
    expect(component.get('.codex-markdown-code').text()).toHaveLength(512)
    component.unmount()
  })

  it('keeps code blocks horizontally scrollable until the user enables wrapping', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const source = `\`\`\`ts\nconst line = '${'x'.repeat(160)}'\n\`\`\``
    const component = await mountSuspended(CodexTimelineItem, {
      props: {
        item: {
          header: {
            item_id: 'item-code-block',
            thread_id: 'thread-1',
            turn_id: 'turn-1',
            detail_kind: CodexTimelineItemKind.AgentMessage,
            schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
            status: CodexTimelineItemStatus.Completed,
          },
          detail: {
            kind: CodexTimelineItemKind.AgentMessage,
            schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
            text: source,
          },
        },
      },
    })

    const code = component.get('.codex-markdown-pre')
    expect(code.classes()).not.toContain('codex-markdown-pre-wrapped')
    await component.get('[aria-label="开启代码换行"]').trigger('click')
    expect(code.classes()).toContain('codex-markdown-pre-wrapped')
    await component.get('[aria-label="复制代码"]').trigger('click')
    await component.get('[aria-label="复制完整 Markdown"]').trigger('click')
    expect(writeText).toHaveBeenNthCalledWith(
      1,
      `const line = '${'x'.repeat(160)}'\n`,
    )
    expect(writeText).toHaveBeenNthCalledWith(2, source)
    component.unmount()
  })

  it('defers code highlighting while streaming and applies it after completion', async () => {
    const record = vi.spyOn(
      ClientPerformanceDiagnosticCollector.prototype,
      'record',
    )
    const source = '```ts\nconst answer: number = 42\n```'
    const item: CodexTextTimelineItem = {
      header: {
        item_id: 'item-streaming-code',
        thread_id: 'thread-1',
        turn_id: 'turn-1',
        detail_kind: CodexTimelineItemKind.AgentMessage,
        schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
        status: CodexTimelineItemStatus.Streaming,
      },
      detail: {
        kind: CodexTimelineItemKind.AgentMessage,
        schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
        text: source,
      },
    }
    const component = await mountSuspended(CodexTimelineItem, {
      props: { item },
    })

    expect(component.get('.codex-markdown-code-streaming').text()).toContain(
      'const answer: number = 42',
    )
    expect(component.find('.codex-markdown-highlight-kwd').exists()).toBe(false)

    await component.setProps({
      item: {
        ...item,
        header: {
          ...item.header,
          status: CodexTimelineItemStatus.Completed,
        },
      },
    })
    await vi.waitFor(() => {
      expect(
        component.get('.codex-markdown-code-highlighted').text(),
      ).toContain('const answer: number = 42')
      expect(component.find('.codex-markdown-highlight-kwd').exists()).toBe(
        true,
      )
    })
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        metric: ClientPerformanceMetric.MarkdownDurationMilliseconds,
        observation: 'observed',
        value: expect.any(Number),
      }),
    )
    component.unmount()
  })

  it('labels a timed-out optimistic message as awaiting confirmation', async () => {
    const component = await mountSuspended(CodexTimelineItem, {
      props: {
        awaitingConfirmation: true,
        item: {
          header: {
            item_id: 'local-operation-1',
            thread_id: 'thread-1',
            turn_id: null,
            detail_kind: CodexTimelineItemKind.UserMessage,
            schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
            status: CodexTimelineItemStatus.Failed,
          },
          detail: {
            kind: CodexTimelineItemKind.UserMessage,
            schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
            text: '等待确认',
          },
        },
      },
    })

    expect(component.text()).toContain('结果确认中')
    expect(component.get('button').text()).toBe('确认并重试')
    component.unmount()
  })

  it('keeps command output collapsed initially and preserves the output context action', async () => {
    const output = '原位展开或上下文均可读取完整命令输出'
    const item: CodexCommandTimelineItem = {
      header: {
        item_id: 'item-command-summary',
        thread_id: 'thread-1',
        turn_id: 'turn-1',
        detail_kind: CodexTimelineItemKind.Command,
        schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
        status: CodexTimelineItemStatus.Completed,
      },
      detail: {
        kind: CodexTimelineItemKind.Command,
        schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
        command: 'pnpm test',
        output,
        exit_code: 0,
      },
    }
    const component = await mountSuspended(CodexTimelineItem, {
      props: { item },
    })

    expect(component.text()).toContain('pnpm test')
    const disclosure = component.get('details').element as HTMLDetailsElement
    expect(disclosure.open).toBe(false)
    expect(component.get('pre').text()).toBe(output)
    disclosure.open = true
    await component.get('.codex-process-context').trigger('click')

    expect(component.emitted('open-context')).toEqual([
      ['item-command-summary', CodexTimelineItemKind.Command],
    ])
    component.unmount()
  })

  it('wraps long command output instead of adding horizontal scrolling', async () => {
    const component = await mountSuspended(CodexCommandOutput, {
      props: {
        item: {
          header: {
            item_id: 'item-command',
            thread_id: 'thread-1',
            turn_id: 'turn-1',
            detail_kind: CodexTimelineItemKind.Command,
            schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
            status: CodexTimelineItemStatus.Completed,
          },
          detail: {
            kind: CodexTimelineItemKind.Command,
            schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
            command: 'x'.repeat(512),
            output: 'y'.repeat(512),
            exit_code: 0,
          },
        },
      },
    })

    expect(component.get('details').classes()).toContain('max-w-full')
    expect(component.get('summary').classes()).toContain('break-all')
    expect(component.get('pre').classes()).toEqual(
      expect.arrayContaining(['max-w-full', 'overflow-x-hidden', 'break-all']),
    )
    component.unmount()
  })

  it('renders a selected long file in the scrollable diff surface', async () => {
    const component = await mountSuspended(CodexDiffView, {
      props: {
        file: createDiffFile({
          path: 'long.txt',
          hunks: [
            {
              header: '@@ -1 +1 @@',
              old_start: 1,
              new_start: 1,
              lines: [
                {
                  kind: CodexDiffLineKind.Addition,
                  content: `+${'z'.repeat(512)}`,
                  old_line_number: null,
                  new_line_number: 1,
                },
              ],
            },
          ],
        }),
      },
    })

    expect(
      component.get('[aria-label="文件变更详情"] > div:nth-child(2)').classes(),
    ).toContain('overflow-x-auto')
    expect(component.get('.break-all').text()).toContain('z'.repeat(512))
    expect(component.findAll('[role="tab"]')).toHaveLength(2)
    expect(component.find('select').exists()).toBe(false)
    component.unmount()
  })

  it('renders a large selected file in bounded chunks', async () => {
    const component = await mountSuspended(CodexDiffView, {
      props: {
        file: createDiffFile({
          path: 'large.txt',
          hunks: [
            {
              header: '@@ -1 +1 @@',
              old_start: 1,
              new_start: 1,
              lines: Array.from({ length: 805 }, (_, index) => ({
                kind: CodexDiffLineKind.Addition,
                content: `line-${index + 1}`,
                old_line_number: null,
                new_line_number: index + 1,
              })),
            },
          ],
        }),
      },
    })

    expect(component.findAll('.break-all')).toHaveLength(800)
    const loadMore = component.findAll('button').at(2)
    expect(loadMore).toBeDefined()
    await loadMore?.trigger('click')
    expect(component.findAll('.break-all')).toHaveLength(805)
    component.unmount()
  })

  it('renders a stable empty selected file surface', async () => {
    const component = await mountSuspended(CodexDiffView, {
      props: { file: createDiffFile({ hunks: [] }) },
    })

    expect(component.findAll('.break-all')).toHaveLength(0)
    expect(component.find('section').exists()).toBe(true)
    component.unmount()
  })
})
