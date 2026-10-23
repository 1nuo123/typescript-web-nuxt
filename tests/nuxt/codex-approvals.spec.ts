import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CodexApprovalDecision,
  CodexApprovalDecisionState,
  CodexApprovalKind,
  CodexApprovalRiskLevel,
  CodexApprovalState,
} from '~/types/codex-approval'
import { normalizeCodexApproval } from '~/utils/codex-contract-normalizer'
import CodexApprovalCard from '~/components/codex/CodexApprovalCard.vue'
import CodexApprovalPrompt from '~/components/codex/CodexApprovalPrompt.vue'
import CodexContextPanel from '~/components/codex/CodexContextPanel.vue'
import { AuthScope, AuthSessionStatus } from '~/types/auth'
import { CodexContextView } from '~/stores/codex-ui'
import { CodexRealtimeConnectionStatus } from '~/types/codex-realtime'
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
    vi.unstubAllGlobals()
    useCodexApprovalsStore().$reset()
    useAuthStore().$reset()
  })

  it('normalizes a partial realtime approval with deterministic timestamps', () => {
    const approval = normalizeCodexApproval(approvalPayload())

    expect(approval.created_at).toBe('1970-01-01T00:00:00.000Z')
    expect(approval.updated_at).toBe('1970-01-01T00:00:00.000Z')
    expect(approval.owner_subject_id).toBe('')
    if (approval.approval_kind !== CodexApprovalKind.Command) {
      throw new Error('测试夹具必须生成命令审批。')
    }
    expect(approval.display_summary.command_actions).toEqual([])
    expect(approval.display_summary.allowed_actions).toEqual([])
  })

  it('projects approval summaries by kind and drops fields from other kinds', () => {
    const command = normalizeCodexApproval(
      approvalPayload({
        display_summary: {
          title: '命令审批',
          risk_level: CodexApprovalRiskLevel.Normal,
          command: 'Get-ChildItem',
          command_actions: [{ action_type: 'read', command: 'Get-ChildItem' }],
          file_changes: [{ path: 'should-not-survive.txt' }],
          allowed_actions: [CodexApprovalDecision.Accept],
        },
      }),
    )
    const fileChange = normalizeCodexApproval(
      approvalPayload({
        approval_id: 'approval-file-change',
        approval_kind: CodexApprovalKind.FileChange,
        display_summary: {
          title: '文件变更审批',
          risk_level: CodexApprovalRiskLevel.Normal,
          file_scope: ['src'],
          file_changes: [{ path: 'src/main.ts', change_kind: 'modified' }],
          command: 'should-not-survive',
          allowed_actions: [CodexApprovalDecision.Accept],
        },
      }),
    )
    const permissions = normalizeCodexApproval(
      approvalPayload({
        approval_id: 'approval-permissions',
        approval_kind: CodexApprovalKind.Permissions,
        display_summary: {
          title: '权限审批',
          risk_level: CodexApprovalRiskLevel.High,
          permission_names: ['network'],
          network_requested: true,
          extra_root_requested: false,
          command_actions: [
            { action_type: 'read', command: 'should-not-survive' },
          ],
          allowed_actions: [
            CodexApprovalDecision.Accept,
            CodexApprovalDecision.AcceptForSession,
            CodexApprovalDecision.Decline,
          ],
        },
      }),
    )

    if (command.approval_kind !== CodexApprovalKind.Command) {
      throw new Error('命令审批判别器不正确。')
    }
    expect(command.display_summary.command).toBe('Get-ChildItem')
    expect('file_changes' in command.display_summary).toBe(false)
    if (fileChange.approval_kind !== CodexApprovalKind.FileChange) {
      throw new Error('文件变更审批判别器不正确。')
    }
    expect(fileChange.display_summary.file_changes).toEqual([
      {
        path: 'src/main.ts',
        change_kind: 'modified',
        added_lines: null,
        deleted_lines: null,
        sensitive: false,
      },
    ])
    expect('command' in fileChange.display_summary).toBe(false)
    if (permissions.approval_kind !== CodexApprovalKind.Permissions) {
      throw new Error('权限审批判别器不正确。')
    }
    expect(permissions.display_summary.permission_names).toEqual(['network'])
    expect('command_actions' in permissions.display_summary).toBe(false)
  })

  it('renders only the Agent-advertised official approval actions', async () => {
    const approval = normalizeCodexApproval(
      approvalPayload({
        display_summary: {
          title: '受限审批',
          reason: '没有 amendment proposal',
          risk_level: CodexApprovalRiskLevel.Normal,
          allowed_actions: [
            CodexApprovalDecision.Accept,
            CodexApprovalDecision.Decline,
          ],
        },
      }),
    )

    expect(approval.display_summary.allowed_actions).toEqual([
      CodexApprovalDecision.Accept,
      CodexApprovalDecision.Decline,
    ])

    const component = await mountSuspended(CodexApprovalCard, {
      props: { approval },
    })
    expect(component.text()).toContain('允许一次')
    expect(component.text()).toContain('拒绝')
    expect(component.text()).not.toContain('本会话允许')
    expect(component.text()).not.toContain('应用命令策略')
    expect(component.text()).not.toContain('应用网络策略')
    component.unmount()
  })

  it('fails closed when an approval omits Agent-advertised actions', async () => {
    const approval = normalizeCodexApproval(approvalPayload())
    const component = await mountSuspended(CodexApprovalCard, {
      props: { approval },
    })

    expect(approval.display_summary.allowed_actions).toEqual([])
    expect(component.text()).not.toContain('允许一次')
    expect(component.text()).not.toContain('本会话允许')
    expect(component.text()).not.toContain('拒绝')
    expect(component.text()).not.toContain('终止')
    component.unmount()
  })

  it('renders an inline approval prompt that navigates without embedding decision controls', async () => {
    const component = await mountSuspended(CodexApprovalPrompt, {
      props: {
        count: 2,
      },
    })

    const prompt = component.get('[role="status"]')
    expect(prompt.text()).toContain('2 项审批等待处理')
    expect(prompt.classes()).toContain('codex-approval-prompt')
    expect(prompt.classes()).not.toContain('fixed')
    expect(component.text()).not.toContain('允许一次')
    await component.get('button').trigger('click')
    expect(component.emitted('open')).toEqual([[]])
    component.unmount()
  })

  it('announces an acknowledged approval decision to assistive technology', async () => {
    const approval = normalizeCodexApproval(approvalPayload())
    const approvalStore = useCodexApprovalsStore()
    approvalStore.decisionStateById[approval.approval_id] =
      CodexApprovalDecisionState.Acknowledged

    const component = await mountSuspended(CodexApprovalCard, {
      props: { approval },
    })

    const acknowledgement = component.get('[role="status"]')
    expect(acknowledgement.attributes('aria-live')).toBe('polite')
    expect(acknowledgement.attributes('aria-atomic')).toBe('true')
    component.unmount()
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

  it('bulk_accept_only_submits_official_accept', async () => {
    const approvalStore = useCodexApprovalsStore()
    vi.spyOn(approvalStore, 'load').mockResolvedValue()
    const decide = vi.spyOn(approvalStore, 'decide').mockResolvedValue()
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
    const first = normalizeCodexApproval(
      approvalPayload({
        approval_id: 'approval-read-only-1',
        turn_id: 'turn-read-only',
        display_summary: {
          title: '只读命令一',
          risk_level: CodexApprovalRiskLevel.Normal,
          command_actions: [],
          read_only: true,
          allowed_actions: [
            CodexApprovalDecision.Accept,
            CodexApprovalDecision.AcceptForSession,
          ],
        },
      }),
    )
    const second = normalizeCodexApproval(
      approvalPayload({
        approval_id: 'approval-read-only-2',
        turn_id: 'turn-read-only',
        display_summary: {
          title: '只读命令二',
          risk_level: CodexApprovalRiskLevel.Normal,
          command_actions: [],
          read_only: true,
          allowed_actions: [CodexApprovalDecision.Accept],
        },
      }),
    )
    approvalStore.upsert(first)
    approvalStore.upsert(second)

    const component = await mountSuspended(CodexApprovalsPage)
    await component.get('button').trigger('click')
    await vi.waitFor(() => expect(decide).toHaveBeenCalledTimes(2))

    expect(decide).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      CodexApprovalDecision.Accept,
    )
    expect(decide).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      CodexApprovalDecision.Accept,
    )
    expect(decide).not.toHaveBeenCalledWith(
      expect.anything(),
      CodexApprovalDecision.AcceptForSession,
    )
    component.unmount()
  })

  it.each([
    CodexRealtimeConnectionStatus.AuthBlocked,
    CodexRealtimeConnectionStatus.Resyncing,
  ])(
    'freezes approval delivery while realtime status is %s',
    async (status) => {
      const fetchMock = vi.fn()
      vi.stubGlobal('$fetch', fetchMock)
      const approval = normalizeCodexApproval(
        approvalPayload({
          display_summary: {
            title: '受保护审批',
            risk_level: CodexApprovalRiskLevel.Normal,
            allowed_actions: [CodexApprovalDecision.Accept],
          },
        }),
      )
      useCodexRealtimeStore().status = status

      await expect(
        useCodexApprovalsStore().decide(approval, CodexApprovalDecision.Accept),
      ).rejects.toThrow(
        status === CodexRealtimeConnectionStatus.AuthBlocked
          ? '登录状态已失效'
          : '实时状态同步中',
      )

      expect(fetchMock).not.toHaveBeenCalled()
    },
  )
})
