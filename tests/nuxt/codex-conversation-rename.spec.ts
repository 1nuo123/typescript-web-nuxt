import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CodexConversationRenameDialog from '~/components/codex/CodexConversationRenameDialog.vue'
import {
  CodexThreadStatus,
  CodexThreadTitleSource,
  type CodexThread,
} from '~/types/codex-thread'

const THREAD_TIMESTAMP = '2026-08-16T02:00:00Z'

const thread: CodexThread = {
  thread_index_id: 'thread-index-rename',
  host_id: 'host-rename',
  workspace_id: 'workspace-rename',
  owner_subject_id: 'subject-rename',
  upstream_thread_id: 'thread-rename',
  display_name: '原会话标题',
  title_source: CodexThreadTitleSource.AppServer,
  model: null,
  model_provider: null,
  reasoning_effort: null,
  status: CodexThreadStatus.Idle,
  active_turn_id: null,
  archived: false,
  is_pinned: false,
  source_kind: 'app_server',
  created_at: THREAD_TIMESTAMP,
  recency_at: THREAD_TIMESTAMP,
  updated_at: THREAD_TIMESTAMP,
  last_synced_at: THREAD_TIMESTAMP,
}

const envelope = <T>(data: T) => ({
  header: {
    code: 'system.success.ok',
    message: 'ok',
    request_id: 'request-rename',
  },
  data,
})

describe('Codex conversation rename dialog', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useCodexSessionStore().$reset()
    document.body.querySelectorAll('.base-modal').forEach((element) => {
      element.remove()
    })
    document.body.style.overflow = ''
  })

  it('keeps the dialog and edited title when the request fails', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('/threads/thread-rename/name')) {
        throw new Error('会话版本已经变化。')
      }
      if (url.endsWith('/threads')) {
        return envelope({ items: [thread], next_cursor: null })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('$fetch', fetchMock)
    const sessionStore = useCodexSessionStore()
    sessionStore.selectedHostId = thread.host_id
    sessionStore.selectedWorkspaceId = thread.workspace_id
    sessionStore.projection.threadsById[thread.upstream_thread_id] = thread

    const component = await mountSuspended(CodexConversationRenameDialog, {
      props: {
        open: true,
        thread,
      },
      global: {
        stubs: {
          teleport: true,
        },
      },
    })
    const input = component.get('input')
    await input.setValue('保留的会话标题')
    await component.get('form').trigger('submit')
    await flushPromises()

    expect(component.text()).toContain('会话版本已经变化。')
    expect(component.get('input').element.value).toBe('保留的会话标题')
    expect(component.emitted('close')).toBeUndefined()
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/codex/hosts/host-rename/threads/thread-rename/name',
      '/codex/hosts/host-rename/threads',
    ])
    component.unmount()
  })

  it('closes only after a successful rename and authority refresh', async () => {
    const renamed = { ...thread, display_name: '最终会话标题' }
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith('/threads/thread-rename/name')) {
        return envelope({
          operation_id: 'operation-rename',
          command_id: 'command-rename',
          status: 'acknowledged',
          replayed: false,
        })
      }
      if (url.endsWith('/threads')) {
        return envelope({ items: [renamed], next_cursor: null })
      }
      throw new Error(`Unexpected URL: ${url}`)
    })
    vi.stubGlobal('$fetch', fetchMock)
    const sessionStore = useCodexSessionStore()
    sessionStore.selectedHostId = thread.host_id
    sessionStore.selectedWorkspaceId = thread.workspace_id
    sessionStore.projection.threadsById[thread.upstream_thread_id] = thread

    const component = await mountSuspended(CodexConversationRenameDialog, {
      props: {
        open: true,
        thread,
      },
      global: {
        stubs: {
          teleport: true,
        },
      },
    })
    await component.get('input').setValue('最终会话标题')
    await component.get('form').trigger('submit')
    await flushPromises()

    expect(component.emitted('close')).toHaveLength(1)
    expect(
      sessionStore.projection.threadsById[thread.upstream_thread_id]
        ?.display_name,
    ).toBe('最终会话标题')
    component.unmount()
  })
})
