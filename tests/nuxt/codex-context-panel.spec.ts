import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CodexContextPanel from '~/components/codex/CodexContextPanel.vue'
import { CodexContextView } from '~/stores/codex-ui'
import { upsertCodexTimelineItem } from '~/utils/codex-event-reducer'
import {
  CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
  CodexDiffChangeKind,
  CodexDiffLineKind,
  CodexTimelineItemKind,
  CodexTimelineItemSource,
  CodexTimelineItemStatus,
  type CodexCommandTimelineItem,
  type CodexDiffTimelineItem,
} from '~/types/codex-item'

const routeState = vi.hoisted(() => ({
  path: '/codex/tasks/thread-1',
  hash: '',
  query: {} as Record<string, string>,
}))
const navigateToMock = vi.hoisted(() => vi.fn((target: unknown) => target))

mockNuxtImport('useRoute', () => () => routeState)
mockNuxtImport('navigateTo', () => navigateToMock)

const diffItem: CodexDiffTimelineItem = {
  header: {
    item_id: 'diff-1',
    thread_id: 'thread-1',
    turn_id: 'turn-1',
    detail_kind: CodexTimelineItemKind.Diff,
    schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
    status: CodexTimelineItemStatus.Completed,
  },
  detail: {
    kind: CodexTimelineItemKind.Diff,
    schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
    diff: {
      total_characters: 48,
      truncated: false,
      files: [
        {
          path: 'src/main.ts',
          old_path: null,
          change_kind: CodexDiffChangeKind.Added,
          binary: false,
          large: false,
          truncated: false,
          hunks: [
            {
              header: '@@ -0,0 +1 @@',
              old_start: 0,
              new_start: 1,
              lines: [
                {
                  kind: CodexDiffLineKind.Addition,
                  content: 'export const ready = true',
                  old_line_number: null,
                  new_line_number: 1,
                },
              ],
            },
          ],
        },
        {
          path: 'README.md',
          old_path: 'README-old.md',
          change_kind: CodexDiffChangeKind.Renamed,
          binary: false,
          large: false,
          truncated: false,
          hunks: [],
        },
      ],
    },
  },
}

const commandItem: CodexCommandTimelineItem = {
  header: {
    item_id: 'command-1',
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
    output: '完整命令输出只在 Context 面板中呈现。',
    exit_code: 0,
  },
}

const seedSelectedDiff = (): void => {
  const sessionStore = useCodexSessionStore()
  sessionStore.selectedThreadId = 'thread-1'
  sessionStore.projection = upsertCodexTimelineItem(
    sessionStore.projection,
    diffItem,
    CodexTimelineItemSource.Snapshot,
  )
  useCodexUiStore().openContext(
    CodexContextView.Changes,
    diffItem.header.item_id,
  )
}

const seedSelectedCommand = (): void => {
  const sessionStore = useCodexSessionStore()
  sessionStore.selectedThreadId = 'thread-1'
  sessionStore.projection = upsertCodexTimelineItem(
    sessionStore.projection,
    commandItem,
    CodexTimelineItemSource.Snapshot,
  )
  useCodexUiStore().openContext(
    CodexContextView.Output,
    commandItem.header.item_id,
  )
}

describe('Codex Diff context panel', () => {
  afterEach(() => {
    useCodexSessionStore().$reset()
    useCodexUiStore().$reset()
    routeState.query = {}
    navigateToMock.mockClear()
  })

  it('shows a file list before a file preview is selected', async () => {
    seedSelectedDiff()
    const component = await mountSuspended(CodexContextPanel)

    const fileList = component.get('[aria-label="变更文件列表"]')
    expect(fileList.text()).toContain('src/main.ts')
    expect(fileList.text()).toContain('README.md')
    expect(component.find('[aria-label="单文件变更页面"]').exists()).toBe(false)

    await fileList.get('button').trigger('click')

    expect(navigateToMock).toHaveBeenCalledWith({
      path: '/codex/tasks/thread-1',
      hash: '',
      query: {
        context: CodexContextView.Changes,
        contextItem: 'diff-1',
        diffFile: 'src/main.ts',
      },
    })
    component.unmount()
  })

  it('renders a routed single-file page and returns to its file list', async () => {
    routeState.query = {
      context: CodexContextView.Changes,
      contextItem: 'diff-1',
      diffFile: 'src/main.ts',
    }
    seedSelectedDiff()
    const component = await mountSuspended(CodexContextPanel)

    expect(component.find('[aria-label="变更文件列表"]').exists()).toBe(false)
    const detailPage = component.get('[aria-label="单文件变更页面"]')
    expect(detailPage.text()).toContain('src/main.ts')
    expect(detailPage.text()).toContain('export const ready = true')

    await detailPage.get('button').trigger('click')

    expect(navigateToMock).toHaveBeenCalledWith({
      path: '/codex/tasks/thread-1',
      hash: '',
      query: {
        context: CodexContextView.Changes,
        contextItem: 'diff-1',
      },
    })
    component.unmount()
  })

  it('preserves task navigation state and the one-time reading anchor when closing context', async () => {
    routeState.query = {
      hostId: 'host-1',
      workspaceId: 'workspace-1',
      search: 'Phase 3',
      archived: 'true',
      context: CodexContextView.Changes,
      contextItem: 'diff-1',
      diffFile: 'src/main.ts',
      contextAnchorItem: 'timeline-item-3',
      contextAnchorOffset: '-24',
    }
    seedSelectedDiff()
    const component = await mountSuspended(CodexContextPanel)

    await component.get('[aria-label="关闭上下文"]').trigger('click')

    expect(navigateToMock).toHaveBeenCalledWith(
      {
        path: '/codex/tasks/thread-1',
        hash: '',
        query: {
          hostId: 'host-1',
          workspaceId: 'workspace-1',
          search: 'Phase 3',
          archived: 'true',
          contextAnchorItem: 'timeline-item-3',
          contextAnchorOffset: '-24',
        },
      },
      { replace: true },
    )
    component.unmount()
  })
})

describe('Codex command output context panel', () => {
  afterEach(() => {
    useCodexSessionStore().$reset()
    useCodexUiStore().$reset()
    routeState.query = {}
    navigateToMock.mockClear()
  })

  it('renders full command output from the routed context item', async () => {
    routeState.query = {
      context: CodexContextView.Output,
      contextItem: commandItem.header.item_id,
    }
    seedSelectedCommand()
    const component = await mountSuspended(CodexContextPanel)

    expect(component.get('[aria-label="选择命令输出"]').text()).toContain(
      'pnpm test',
    )
    expect(component.text()).toContain('完整命令输出只在 Context 面板中呈现。')

    await component
      .get('[aria-label="选择命令输出"]')
      .setValue(commandItem.header.item_id)

    expect(navigateToMock).toHaveBeenCalledWith(
      {
        path: '/codex/tasks/thread-1',
        hash: '',
        query: {
          context: CodexContextView.Output,
          contextItem: commandItem.header.item_id,
        },
      },
      { replace: true },
    )
    component.unmount()
  })
})
