import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import CodexCommandOutput from '~/components/codex/CodexCommandOutput.vue'
import CodexDiffView from '~/components/codex/CodexDiffView.vue'
import CodexTimelineItem from '~/components/codex/CodexTimelineItem.vue'
import {
  CodexDiffChangeKind,
  CodexDiffLineKind,
  CodexTimelineItemKind,
  CodexTimelineItemStatus,
} from '~/types/codex-item'

describe('Codex timeline item', () => {
  it('renders Markdown inside the styled DOM container', async () => {
    const component = await mountSuspended(CodexTimelineItem, {
      props: {
        item: {
          item_id: 'item-1',
          thread_id: 'thread-1',
          turn_id: 'turn-1',
          kind: CodexTimelineItemKind.AgentMessage,
          status: CodexTimelineItemStatus.Completed,
          text: '**done**',
        },
      },
    })

    const markdown = component.get('.codex-markdown')
    expect(markdown.text()).toBe('done')
    expect(markdown.classes()).toEqual(
      expect.arrayContaining([
        'break-words',
        'text-sm',
        'leading-6',
        'text-ink',
      ]),
    )
  })

  it('keeps long Markdown content within the timeline item', async () => {
    const component = await mountSuspended(CodexTimelineItem, {
      props: {
        item: {
          item_id: 'item-long-markdown',
          thread_id: 'thread-1',
          turn_id: 'turn-1',
          kind: CodexTimelineItemKind.AgentMessage,
          status: CodexTimelineItemStatus.Completed,
          text: `\`${'a'.repeat(512)}\``,
        },
      },
    })

    expect(component.get('article').classes()).toEqual(
      expect.arrayContaining(['min-w-0', 'max-w-full', 'overflow-hidden']),
    )
    expect(component.get('.codex-markdown-code').text()).toHaveLength(512)
    component.unmount()
  })

  it('wraps long command output instead of adding horizontal scrolling', async () => {
    const component = await mountSuspended(CodexCommandOutput, {
      props: {
        item: {
          item_id: 'item-command',
          thread_id: 'thread-1',
          turn_id: 'turn-1',
          kind: CodexTimelineItemKind.Command,
          status: CodexTimelineItemStatus.Completed,
          command: 'x'.repeat(512),
          output: 'y'.repeat(512),
          exit_code: 0,
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

  it('keeps long diff lines readable in the scrollable diff surface', async () => {
    const component = await mountSuspended(CodexDiffView, {
      props: {
        item: {
          item_id: 'item-diff',
          thread_id: 'thread-1',
          turn_id: 'turn-1',
          kind: CodexTimelineItemKind.Diff,
          status: CodexTimelineItemStatus.Completed,
          diff: {
            files: [
              {
                path: 'long.txt',
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
                        content: `+${'z'.repeat(512)}`,
                        old_line_number: null,
                        new_line_number: 1,
                      },
                    ],
                  },
                ],
              },
            ],
            total_characters: 512,
            truncated: false,
          },
        },
      },
    })

    expect(
      component.get('[aria-label="文件变更"] > div:nth-child(2)').classes(),
    ).toContain('overflow-x-auto')
    expect(component.get('.break-all').text()).toContain('z'.repeat(512))
    expect(component.findAll('[role="tab"]')).toHaveLength(2)
    component.unmount()
  })
})
