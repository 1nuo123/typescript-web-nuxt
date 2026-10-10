import type {
  CodexApprovalCollection,
  CodexApprovalDecision,
} from '~/types/codex-approval'
import type { CodexOperationAccepted } from '~/types/codex-turn'
import {
  buildCodexIdempotencyHeaders,
  createCodexApiClient,
} from './codex-api-client'

export const CODEX_APPROVALS_PATH = '/codex/approvals'

export const createCodexApprovalsClient = () => {
  const client = createCodexApiClient()
  return {
    list: () => client.get<CodexApprovalCollection>(CODEX_APPROVALS_PATH),
    decide: (
      approvalId: string,
      decision: CodexApprovalDecision,
      approvalVersion: number,
      stepUpToken?: string,
      idempotencyKey = `approval:${approvalId}:${approvalVersion}:${decision}`,
    ) =>
      client.post<CodexOperationAccepted>(
        `${CODEX_APPROVALS_PATH}/${encodeURIComponent(approvalId)}/decision`,
        { decision, approval_version: approvalVersion },
        {
          headers: {
            ...buildCodexIdempotencyHeaders(idempotencyKey),
            ...(stepUpToken ? { 'X-Step-Up-Token': stepUpToken } : {}),
          },
        },
      ),
  }
}
