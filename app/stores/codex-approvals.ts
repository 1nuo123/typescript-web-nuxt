import { defineStore } from 'pinia'
import {
  CodexApprovalDecision,
  CodexApprovalRiskLevel,
  type CodexApproval,
} from '~/types/codex-approval'
import {
  CodexRealtimeEventType,
  type CodexRealtimeEvent,
} from '~/types/codex-realtime'

interface CodexApprovalState {
  approvalsById: Record<string, CodexApproval>
  loading: boolean
  decidingId: string | null
}

export const useCodexApprovalsStore = defineStore('codex-approvals', {
  state: (): CodexApprovalState => ({
    approvalsById: {},
    loading: false,
    decidingId: null,
  }),
  getters: {
    pending(state): CodexApproval[] {
      return Object.values(state.approvalsById)
        .filter((approval) => approval.state === 'pending')
        .sort((left, right) => right.created_at.localeCompare(left.created_at))
    },
  },
  actions: {
    async load(): Promise<void> {
      this.loading = true
      try {
        const collection = await createCodexApprovalsClient().list()
        this.approvalsById = Object.fromEntries(
          collection.items.map((approval) => [approval.approval_id, approval]),
        )
      } finally {
        this.loading = false
      }
    },

    async decide(
      approval: CodexApproval,
      decision: CodexApprovalDecision,
      stepUpToken?: string,
    ): Promise<void> {
      if (
        approval.risk_level === CodexApprovalRiskLevel.High &&
        decision === CodexApprovalDecision.Accept &&
        !stepUpToken
      ) {
        throw new Error('高风险审批需要增强验证。')
      }
      this.decidingId = approval.approval_id
      try {
        await createCodexApprovalsClient().decide(
          approval.approval_id,
          decision,
          approval.version,
          stepUpToken,
        )
        await this.load()
      } finally {
        this.decidingId = null
      }
    },

    applyRealtimeEvent(event: CodexRealtimeEvent): void {
      if (event.type === CodexRealtimeEventType.ApprovalOpened) {
        const approval = event.payload.approval
        this.approvalsById[approval.approval_id] = approval
      }
      if (event.type === CodexRealtimeEventType.ApprovalResolved) {
        const approval = event.payload.approval
        this.approvalsById[approval.approval_id] = approval
      }
    },

    clear(): void {
      this.$reset()
    },
  },
})
