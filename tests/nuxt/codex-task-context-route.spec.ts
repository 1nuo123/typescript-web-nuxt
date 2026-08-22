import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CodexTaskDetailPage from '~/pages/codex/tasks/[threadId].vue'
import { AuthScope, AuthSessionStatus } from '~/types/auth'
import { CodexContextView } from '~/stores/codex-ui'

interface MockTaskRoute {
  path: string
  hash: string
  params: { threadId: string }
  query: Record<string, string>
}

const routeState = vi.hoisted(() => ({
  value: null as unknown as MockTaskRoute,
}))
const navigateToMock = vi.hoisted(() => vi.fn())
const captureAnchorMock = vi.hoisted(() => vi.fn())
const restoreReadingAnchorMock = vi.hoisted(() => vi.fn())
const blurInputMock = vi.hoisted(() => vi.fn())

mockNuxtImport('useRoute', () => () => routeState.value)
mockNuxtImport('navigateTo', () => navigateToMock)

const CodexTimelineStub = defineComponent({
  setup(_, { expose }) {
    expose({
      captureAnchor: captureAnchorMock,
      onCommit: vi.fn(),
      restoreAnchor: vi.fn(),
      restoreReadingAnchor: restoreReadingAnchorMock,
      visibleItemIds: (): string[] => [],
    })
    return () => h('div')
  },
})

const CodexComposerStub = defineComponent({
  emits: ['submit'],
  setup(_, { emit, expose }) {
    expose({ blurInput: blurInputMock })
    return () =>
      h(
        'button',
        {
          'data-test': 'composer-submit',
          onClick: () => emit('submit', 'accepted message'),
        },
        'submit',
      )
  },
})

const applyReadSession = (): void => {
  const authStore = useAuthStore()
  authStore.status = AuthSessionStatus.Authenticated
  authStore.accessToken = 'access-token'
  authStore.principal = {
    kind: 'authenticated_principal',
    subject_id: 'subject-1',
    username: 'codex-user',
    roles: [],
    scopes: [AuthScope.CodexRead],
    is_admin: false,
  }
}

describe('Codex task Context route', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    navigateToMock.mockClear()
    captureAnchorMock.mockClear()
    restoreReadingAnchorMock.mockClear()
    blurInputMock.mockClear()
    useAuthStore().$reset()
    useCodexSessionStore().$reset()
    useCodexUiStore().$reset()
  })

  it('context_route_back_restores_thread_anchor', async () => {
    routeState.value = reactive({
      path: '/codex/tasks/thread-1',
      hash: '',
      params: { threadId: 'thread-1' },
      query: {
        hostId: 'host-1',
        workspaceId: 'workspace-1',
        search: 'Phase 3',
        archived: 'true',
        context: CodexContextView.Changes,
        contextItem: 'diff-1',
        contextAnchorItem: 'timeline-item-3',
        contextAnchorOffset: '-24',
      },
    })
    applyReadSession()
    const sessionStore = useCodexSessionStore()
    vi.spyOn(sessionStore, 'restoreRouteSelection').mockResolvedValue(true)
    vi.spyOn(sessionStore, 'loadThreadSnapshot').mockResolvedValue()
    restoreReadingAnchorMock.mockResolvedValue(undefined)

    const component = await mountSuspended(CodexTaskDetailPage, {
      global: {
        stubs: {
          AppAlert: true,
          CodexApprovalPrompt: true,
          CodexComposer: CodexComposerStub,
          CodexConversationHeader: true,
          CodexTimeline: CodexTimelineStub,
        },
      },
    })
    await flushPromises()
    const routerReplaceMock = vi
      .spyOn(
        (
          component.vm as unknown as {
            $router: { replace: (location: unknown) => Promise<unknown> }
          }
        ).$router,
        'replace',
      )
      .mockResolvedValue(undefined)

    expect(useCodexUiStore().contextPanelOpen).toBe(true)
    expect(restoreReadingAnchorMock).not.toHaveBeenCalled()

    routeState.value.query = {
      hostId: 'host-1',
      workspaceId: 'workspace-1',
      search: 'Phase 3',
      archived: 'true',
      contextAnchorItem: 'timeline-item-3',
      contextAnchorOffset: '-24',
    }
    await nextTick()
    await flushPromises()

    expect(restoreReadingAnchorMock).toHaveBeenCalledWith({
      itemId: 'timeline-item-3',
      offset: -24,
    })
    expect(routerReplaceMock).toHaveBeenLastCalledWith({
      path: '/codex/tasks/thread-1',
      hash: '',
      query: {
        hostId: 'host-1',
        workspaceId: 'workspace-1',
        search: 'Phase 3',
        archived: 'true',
      },
    })
    component.unmount()
  })

  it('blurs_the_composer_only_after_a_turn_submission_is_accepted', async () => {
    routeState.value = reactive({
      path: '/codex/tasks/thread-1',
      hash: '',
      params: { threadId: 'thread-1' },
      query: {
        hostId: 'host-1',
        workspaceId: 'workspace-1',
      },
    })
    applyReadSession()
    const sessionStore = useCodexSessionStore()
    const uiStore = useCodexUiStore()
    uiStore.setDraft('thread-1', '待清理草稿')
    vi.spyOn(sessionStore, 'restoreRouteSelection').mockResolvedValue(true)
    vi.spyOn(sessionStore, 'loadThreadSnapshot').mockResolvedValue()
    const sendMessage = vi
      .spyOn(sessionStore, 'sendMessage')
      .mockResolvedValue({} as never)

    const component = await mountSuspended(CodexTaskDetailPage, {
      global: {
        stubs: {
          AppAlert: true,
          CodexApprovalPrompt: true,
          CodexComposer: CodexComposerStub,
          CodexConversationHeader: true,
          CodexTimeline: CodexTimelineStub,
        },
      },
    })
    await flushPromises()
    const composer = component.findComponent(CodexComposerStub)
    expect(composer.exists()).toBe(true)
    composer.vm.$emit('submit', 'accepted message')
    await flushPromises()

    expect(sendMessage).toHaveBeenCalledWith('accepted message')
    expect(blurInputMock).toHaveBeenCalledTimes(1)
    expect(uiStore.draftsByThreadId['thread-1']).toBeUndefined()
    component.unmount()
  })

  it('keeps_composer_focus_when_a_turn_submission_is_rejected', async () => {
    routeState.value = reactive({
      path: '/codex/tasks/thread-1',
      hash: '',
      params: { threadId: 'thread-1' },
      query: {
        hostId: 'host-1',
        workspaceId: 'workspace-1',
      },
    })
    applyReadSession()
    const sessionStore = useCodexSessionStore()
    vi.spyOn(sessionStore, 'restoreRouteSelection').mockResolvedValue(true)
    vi.spyOn(sessionStore, 'loadThreadSnapshot').mockResolvedValue()
    vi.spyOn(sessionStore, 'sendMessage').mockRejectedValue(
      new Error('提交未受理'),
    )

    const component = await mountSuspended(CodexTaskDetailPage, {
      global: {
        stubs: {
          AppAlert: true,
          CodexApprovalPrompt: true,
          CodexComposer: CodexComposerStub,
          CodexConversationHeader: true,
          CodexTimeline: CodexTimelineStub,
        },
      },
    })
    await flushPromises()
    component.findComponent(CodexComposerStub).vm.$emit('submit', 'rejected')
    await flushPromises()

    expect(blurInputMock).not.toHaveBeenCalled()
    component.unmount()
  })
})
