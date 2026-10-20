import { defineStore } from 'pinia'
import {
  CodexApprovalDecision,
  CodexApprovalDecisionState,
  CodexApprovalRiskLevel,
  CodexApprovalState,
  type CodexApproval,
} from '~/types/codex-approval'
import {
  CodexRealtimeEventType,
  type CodexRealtimeEvent,
} from '~/types/codex-realtime'
import { normalizeCodexApproval } from '~/utils/codex-contract-normalizer'
import { getCodexRealtimeWriteBlockReason } from '~/utils/codex-realtime-write-guard'

const STEP_UP_REQUIRED_DECISIONS = new Set<CodexApprovalDecision>([
  CodexApprovalDecision.Accept,
  CodexApprovalDecision.AcceptForSession,
  CodexApprovalDecision.AcceptWithExecpolicyAmendment,
  CodexApprovalDecision.ApplyNetworkPolicyAmendment,
])

interface CodexApprovalStateModel {
  approvalsById: Record<string, CodexApproval>
  loading: boolean
  initialized: boolean
  decisionStateById: Record<string, CodexApprovalDecisionState>
  decisionErrorById: Record<string, string>
  lastResolvedApproval: CodexApproval | null
}

let approvalsLoadInFlight: Promise<void> | null = null
let approvalsLoadGeneration = 0

const compareApprovalRecency = (
  left: CodexApproval,
  right: CodexApproval,
): number => {
  if (left.version !== right.version) return left.version - right.version
  return left.updated_at.localeCompare(right.updated_at)
}

const sortApprovals = (items: CodexApproval[]): CodexApproval[] =>
  [...items].sort((left, right) => {
    const byCreatedAt = right.created_at.localeCompare(left.created_at)
    return byCreatedAt || right.approval_id.localeCompare(left.approval_id)
  })

export const useCodexApprovalsStore = defineStore('codex-approvals', {
  state: (): CodexApprovalStateModel => ({
    approvalsById: {},
    loading: false,
    initialized: false,
    decisionStateById: {},
    decisionErrorById: {},
    lastResolvedApproval: null,
  }),
  getters: {
    pending(state): CodexApproval[] {
      return sortApprovals(
        Object.values(state.approvalsById).filter(
          (approval) => approval.state === CodexApprovalState.Pending,
        ),
      )
    },
    pendingForThread(state): (threadId: string) => CodexApproval[] {
      return (threadId: string) =>
        sortApprovals(
          Object.values(state.approvalsById).filter(
            (approval) =>
              approval.state === CodexApprovalState.Pending &&
              approval.thread_id === threadId,
          ),
        )
    },
    recentlyResolved(state): CodexApproval[] {
      return sortApprovals(
        Object.values(state.approvalsById).filter(
          (approval) => approval.state !== CodexApprovalState.Pending,
        ),
      ).slice(0, 10)
    },
  },
  actions: {
    upsert(approval: CodexApproval): void {
      const existing = this.approvalsById[approval.approval_id]
      if (existing && compareApprovalRecency(approval, existing) < 0) return
      this.approvalsById[approval.approval_id] = approval
    },

    async load(): Promise<void> {
      if (approvalsLoadInFlight) return approvalsLoadInFlight
      const generation = approvalsLoadGeneration + 1
      approvalsLoadGeneration = generation
      this.loading = true
      const request = (async (): Promise<void> => {
        const collection = await createCodexApprovalsClient().list()
        if (generation !== approvalsLoadGeneration) return
        for (const value of collection.items) {
          this.upsert(normalizeCodexApproval(value))
        }
        this.initialized = true
      })()
      approvalsLoadInFlight = request
      try {
        await request
      } finally {
        if (approvalsLoadInFlight === request) approvalsLoadInFlight = null
        this.loading = false
      }
    },

    async decide(
      approval: CodexApproval,
      decision: CodexApprovalDecision,
      stepUpToken?: string,
    ): Promise<void> {
      const blockReason = getCodexRealtimeWriteBlockReason(
        useCodexRealtimeStore().status,
        'approval',
        useCodexSessionStore().hosts.find(
          (host) => host.host_id === approval.host_id,
        ) ?? null,
      )
      if (blockReason) throw new Error(blockReason)
      if (
        approval.risk_level === CodexApprovalRiskLevel.High &&
        STEP_UP_REQUIRED_DECISIONS.has(decision) &&
        !stepUpToken
      ) {
        throw new Error('高风险审批需要增强验证。')
      }
      const approvalId = approval.approval_id
      if (
        this.decisionStateById[approvalId] ===
        CodexApprovalDecisionState.Submitting
      ) {
        return
      }
      this.decisionStateById[approvalId] = CodexApprovalDecisionState.Submitting
      Reflect.deleteProperty(this.decisionErrorById, approvalId)
      try {
        await createCodexApprovalsClient().decide(
          approvalId,
          decision,
          approval.version,
          stepUpToken,
        )
        const current = this.approvalsById[approvalId]
        if (current?.state === CodexApprovalState.Pending) {
          this.approvalsById[approvalId] = {
            ...current,
            state: CodexApprovalState.Claimed,
            decision,
          }
        }
        this.decisionStateById[approvalId] =
          CodexApprovalDecisionState.Acknowledged
      } catch (error) {
        this.decisionStateById[approvalId] = CodexApprovalDecisionState.Failed
        this.decisionErrorById[approvalId] =
          error instanceof Error ? error.message : '审批提交失败。'
        throw error
      }
    },

    applyRealtimeEvent(event: CodexRealtimeEvent): void {
      if (
        event.detail.kind !== CodexRealtimeEventType.ApprovalOpened &&
        event.detail.kind !== CodexRealtimeEventType.ApprovalResolved
      ) {
        return
      }
      const approval = normalizeCodexApproval(event.detail.approval)
      const existing = this.approvalsById[approval.approval_id]
      if (existing && compareApprovalRecency(approval, existing) < 0) return
      this.upsert(approval)
      if (event.detail.kind === CodexRealtimeEventType.ApprovalResolved) {
        this.lastResolvedApproval = approval
        this.decisionStateById[approval.approval_id] =
          CodexApprovalDecisionState.Acknowledged
      }
    },

    clear(): void {
      approvalsLoadGeneration += 1
      approvalsLoadInFlight = null
      this.$reset()
    },
  },
})
