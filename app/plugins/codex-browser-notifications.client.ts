import {
  CodexBrowserNotificationKind,
  publishCodexBrowserNotification,
} from '~/utils/codex-browser-notification'
import { CodexThreadStatus } from '~/types/codex-thread'

/**
 * 仅观察已投影的摘要状态并发送固定通知。
 * 首次同步只建立基线，防止刷新页面时把历史审批或历史终态当作新事件通知。
 */
export default defineNuxtPlugin(() => {
  const approvalsStore = useCodexApprovalsStore()
  const sessionStore = useCodexSessionStore()
  let knownApprovalIds = new Set<string>()
  let knownThreadStatuses = new Map<string, CodexThreadStatus>()
  let initialized = false

  watch(
    [
      () => approvalsStore.pending.map((approval) => approval.approval_id),
      () =>
        sessionStore.hostThreads.map((thread) => ({
          id: thread.upstream_thread_id,
          status: thread.status,
        })),
    ],
    ([pendingApprovalIds, threads]) => {
      if (!initialized) {
        knownApprovalIds = new Set(pendingApprovalIds)
        knownThreadStatuses = new Map(
          threads.map((thread) => [thread.id, thread.status]),
        )
        initialized = true
        return
      }

      if (
        pendingApprovalIds.some(
          (approvalId) => !knownApprovalIds.has(approvalId),
        )
      ) {
        publishCodexBrowserNotification(CodexBrowserNotificationKind.Approval)
      }
      knownApprovalIds = new Set(pendingApprovalIds)

      for (const thread of threads) {
        const previousStatus = knownThreadStatuses.get(thread.id)
        if (previousStatus === CodexThreadStatus.Active) {
          if (thread.status === CodexThreadStatus.Idle) {
            publishCodexBrowserNotification(
              CodexBrowserNotificationKind.Completed,
            )
          }
          if (thread.status === CodexThreadStatus.Failed) {
            publishCodexBrowserNotification(CodexBrowserNotificationKind.Failed)
          }
        }
      }
      knownThreadStatuses = new Map(
        threads.map((thread) => [thread.id, thread.status]),
      )
    },
    { deep: true, immediate: true },
  )
})
