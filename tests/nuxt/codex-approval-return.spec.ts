import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CodexApprovalsPage from '~/pages/codex/approvals/index.vue'
import {
  CodexApprovalDecision,
  CodexApprovalKind,
  CodexApprovalRiskLevel,
  CodexApprovalState,
} from '~/types/codex-approval'
import { CodexRealtimeEventType } from '~/types/codex-realtime'
import { normalizeCodexApproval } from '~/utils/codex-contract-normalizer'

const routeState = vi.hoisted(() => ({
  value: {
    query: {
      threadId: 'thread-1',
      returnTo:
        '/codex/tasks/thread-1?hostId=host-1&timelineAnchorItem=item-3&timelineAnchorOffset=-18',
    },
  },
}))
const navigateToMock = vi.hoisted(() => vi.fn())

mockNuxtImport('useRoute', () => () => routeState.value)
mockNuxtImport('navigateTo', () => navigateToMock)

const approval = normalizeCodexApproval({
  approval_id: 'approval-1',
  host_id: 'host-1',
  thread_id: 'thread-1',
  approval_kind: CodexApprovalKind.Command,
  risk_level: CodexApprovalRiskLevel.Normal,
  state: CodexApprovalState.Applied,
  decision: CodexApprovalDecision.Accept,
  version: 2,
  display_summary: {
    title: 'Resolved approval',
    reason: 'Completed',
    risk_level: CodexApprovalRiskLevel.Normal,
    allowed_actions: [CodexApprovalDecision.Accept],
  },
})

describe('Codex approval return navigation', () => {
  afterEach(() => {
    navigateToMock.mockClear()
    useCodexApprovalsStore().$reset()
  })

  it('returns to the original thread when the authoritative approval.resolved event arrives', async () => {
    const store = useCodexApprovalsStore()
    store.upsert(
      normalizeCodexApproval({
        ...approval,
        state: CodexApprovalState.Pending,
        decision: null,
        version: 1,
      }),
    )
    vi.spyOn(store, 'load').mockResolvedValue()
    const component = await mountSuspended(CodexApprovalsPage)

    store.applyRealtimeEvent({
      header: {
        kind: 'codex_realtime_event',
        schema_version: '2.0',
        stream_epoch: 'epoch-1',
        event_id: 'event-1',
        occurred_at: '2026-08-20T00:00:00Z',
        host_id: 'host-1',
        thread_id: 'thread-1',
        detail_kind: CodexRealtimeEventType.ApprovalResolved,
      },
      detail: {
        schema_version: '2.0',
        kind: CodexRealtimeEventType.ApprovalResolved,
        approval,
      },
    })
    await Promise.resolve()

    expect(navigateToMock).toHaveBeenCalledWith(
      '/codex/tasks/thread-1?hostId=host-1&timelineAnchorItem=item-3&timelineAnchorOffset=-18',
    )
    component.unmount()
  })

  it('does not leave the page for a resolved approval from another thread', async () => {
    const store = useCodexApprovalsStore()
    vi.spyOn(store, 'load').mockResolvedValue()
    const component = await mountSuspended(CodexApprovalsPage)

    store.applyRealtimeEvent({
      header: {
        kind: 'codex_realtime_event',
        schema_version: '2.0',
        stream_epoch: 'epoch-1',
        event_id: 'event-other-thread',
        occurred_at: '2026-08-20T00:00:00Z',
        host_id: 'host-1',
        thread_id: 'thread-2',
        detail_kind: CodexRealtimeEventType.ApprovalResolved,
      },
      detail: {
        schema_version: '2.0',
        kind: CodexRealtimeEventType.ApprovalResolved,
        approval: normalizeCodexApproval({
          ...approval,
          approval_id: 'approval-other-thread',
          thread_id: 'thread-2',
        }),
      },
    })
    await Promise.resolve()

    expect(navigateToMock).not.toHaveBeenCalled()
    component.unmount()
  })
})
