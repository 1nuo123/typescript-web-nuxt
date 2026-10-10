import type { CodexOperationAccepted } from '~/types/codex-turn'
import { createCodexApiClient } from './codex-api-client'

export interface CodexOperationView {
  operation_id: string
  command_id: string
  host_id: string
  workspace_id: string | null
  thread_id: string | null
  status: string
  error_code: string | null
  updated_at: string
}

/** 只核对既有账本，不因超时自动重投 mutation。 */
export const waitForCodexOperation = async (
  hostId: string,
  accepted: CodexOperationAccepted,
): Promise<CodexOperationView> => {
  const client = createCodexApiClient()
  const deadline = Date.now() + 60_000
  while (true) {
    const operation = await client.get<CodexOperationView>(
      `/codex/hosts/${encodeURIComponent(hostId)}/operations/${encodeURIComponent(accepted.operation_id)}`,
    )
    if (operation.status === 'completed') return operation
    if (['failed', 'unknown', 'timed_out', 'cancelled'].includes(operation.status)) {
      throw new Error(`操作未完成：${operation.error_code || operation.status}（${operation.operation_id}）`)
    }
    if (Date.now() >= deadline) {
      throw new Error(`仍在等待本机确认，可重新核对操作 ${operation.operation_id}；请勿重复提交。`)
    }
    await new Promise(resolve => setTimeout(resolve, 750))
  }
}
