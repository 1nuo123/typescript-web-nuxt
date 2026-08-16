import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CodexApprovalDecision,
  CodexApprovalKind,
  CodexApprovalRiskLevel,
  CodexApprovalState,
} from '~/types/codex-approval'
import { normalizeCodexApproval } from '~/utils/codex-contract-normalizer'
import CodexApprovalCard from '~/components/codex/CodexApprovalCard.vue'
import CodexContextPanel from '~/components/codex/CodexContextPanel.vue'
import { AuthScope, AuthSessionStatus } from '~/types/auth'
import { CodexContextView } from '~/stores/codex-ui'
import CodexApprovalsPage from '~/pages/codex/approvals/index.vue'

const approvalPayload = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  approval_id: 'approval-1',
  host_id: 'host-1',
  thread_id: 'thread-1',
  approval_kind: CodexApprovalKind.Command,
  risk_level: CodexApprovalRiskLevel.Normal,
  state: CodexApprovalState.Pending,
  version: 1,
  display_summary: {
    title: 'Command approval',
    reason: 'Inspect the workspace',
    risk_level: CodexApprovalRiskLevel.Normal,
  },
  ...overrides,
})

describe('Codex approval projection', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    useCodexApprovalsStore().$reset()
  })

  it('normalizes a partial realtime approval with deterministic timestamps', () => {
    const approval = normalizeCodexApproval(approvalPayload())

    expect(approval.created_at).toBe('1970-01-01T00:00:00.000Z')
    expect(approval.updated_at).toBe('1970-01-01T00:00:00.000Z')
    expect(approval.owner_subject_id).toBe('')
    expect(approval.display_summary.command_actions).toEqual([])
    expect(approval.display_summary.file_changes).toEqual([])
  })

  it('ignores out-of-order approval updates and keeps deterministic sorting', () => {
    const store = useCodexApprovalsStore()
    store.upsert(
      normalizeCodexApproval(
        approvalPayload({
          version: 2,
          updated_at: '2026-08-11T10:00:00Z',
          created_at: '2026-08-11T09:00:00Z',
          state: CodexApprovalState.Applied,
        }),
      ),
    )
    store.upsert(
      normalizeCodexApproval(
        approvalPayload({
          version: 1,
          updated_at: '2026-08-11T11:00:00Z',
          created_at: '2026-08-11T09:00:00Z',
          state: CodexApprovalState.Pending,
        }),
      ),
    )
    store.upsert(
      normalizeCodexApproval(
        approvalPayload({
          approval_id: 'approval-2',
          created_at: '2026-08-11T09:00:00Z',
          updated_at: '2026-08-11T09:00:00Z',
        }),
      ),
    )

    expect(store.approvalsById['approval-1']?.state).toBe(
      CodexApprovalState.Applied,
    )
    expect(store.pending.map((approval) => approval.approval_id)).toEqual([
      'approval-2',
    ])
    expect(
      store.recentlyResolved.map((approval) => approval.approval_id),
    ).toEqual(['approval-1'])
  })

  it('renders the same approval card in the conversation context and approval projection', async () => {
    const approval = normalizeCodexApproval(
      approvalPayload({
        display_summary: {
          title: '共享审批',
          reason: '读取工作区',
          risk_level: CodexApprovalRiskLevel.Normal,
          command: 'Get-ChildItem',
          command_actions: [],
          file_scope: [],
          file_changes: [],
          permission_names: [],
          network_requested: false,
          extra_root_requested: false,
          read_only: true,
        },
      }),
    )
    const approvalsStore = useCodexApprovalsStore()
    approvalsStore.upsert(approval)
    const authStore = useAuthStore()
    authStore.status = AuthSessionStatus.Authenticated
    authStore.principal = {
      kind: 'authenticated_principal',
      subject_id: 'subject-1',
      username: 'codex-user',
      roles: [],
      scopes: [AuthScope.CodexTerminal],
      is_admin: false,
    }

    const card = await mountSuspended(CodexApprovalCard, {
      props: { approval },
    })
    expect(card.text()).toContain('共享审批')
    expect(card.text()).toContain('Get-ChildItem')

    const sessionStore = useCodexSessionStore()
    sessionStore.selectedThreadId = 'thread-1'
    const context = useCodexUiStore()
    context.openContext(CodexContextView.Approvals)
    const panel = await mountSuspended(CodexContextPanel)
    expect(panel.text()).toContain('共享审批')
    expect(panel.text()).toContain('审批')
    card.unmount()
    panel.unmount()
  })

  it('renders decisions separately from delivery states without exposing enum values', async () => {
    const store = useCodexApprovalsStore()
    vi.spyOn(store, 'load').mockResolvedValue()
    const cases = [
      {
        approval_id: 'approval-accept',
        state: CodexApprovalState.Applied,
        decision: CodexApprovalDecision.Accept,
        title: '允许记录',
      },
      {
        approval_id: 'approval-decline',
        state: CodexApprovalState.DeliveryFailed,
        decision: CodexApprovalDecision.Decline,
        title: '拒绝记录',
      },
      {
        approval_id: 'approval-cancel',
        state: CodexApprovalState.Cancelled,
        decision: CodexApprovalDecision.Cancel,
        title: '取消记录',
      },
      {
        approval_id: 'approval-expired',
        state: CodexApprovalState.Expired,
        decision: null,
        title: '过期记录',
      },
    ] as const
    for (const [index, item] of cases.entries()) {
      store.upsert(
        normalizeCodexApproval(
          approvalPayload({
            approval_id: item.approval_id,
            state: item.state,
            decision: item.decision,
            version: index + 2,
            created_at: `2026-08-16T0${index}:00:00Z`,
            updated_at: `2026-08-16T0${index}:30:00Z`,
            display_summary: {
              title: item.title,
              reason: '审批展示回归',
              risk_level: CodexApprovalRiskLevel.Normal,
            },
          }),
        ),
      )
    }

    const component = await mountSuspended(CodexApprovalsPage)
    await nextTick()

    expect(component.text()).toContain('已允许')
    expect(component.text()).toContain('已拒绝')
    expect(component.text()).toContain('已取消')
    expect(component.text()).toContain('未处理')
    expect(component.text()).toContain('已交付')
    expect(component.text()).toContain('交付失败')
    expect(component.text()).toContain('已过期')
    expect(component.text()).not.toContain('applied')
    expect(component.text()).not.toContain('delivery_failed')
    component.unmount()
  })
})
