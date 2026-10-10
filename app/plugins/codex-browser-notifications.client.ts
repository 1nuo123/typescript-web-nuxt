import { CodexBrowserNotificationKind, publishCodexBrowserNotification } from '~/utils/codex-browser-notification'
import { CodexThreadStatus } from '~/types/codex-thread'
import { buildCodexTaskRoute, CODEX_APPROVALS_ROUTE } from '~/types/routes'

/** 系统通知只带固定文案；目标闭包随账号失效，不落盘正文。 */
export default defineNuxtPlugin(() => {
  const approvals = useCodexApprovalsStore()
  const session = useCodexSessionStore()
  const auth = useAuthStore()
  let knownApprovals = new Set<string>()
  let knownThreads = new Map<string, CodexThreadStatus>()
  let initialized = false

  const notifyOnce = async (eventId: string, kind: CodexBrowserNotificationKind, target: string) => {
    const owner = auth.principal?.subject_id
    if (!owner || !navigator.locks) return
    await navigator.locks.request(`codex-notification:${owner}`, async () => {
      if (auth.principal?.subject_id !== owner) return
      const key = `codex-notification:${owner}`
      let recent: Record<string, number> = {}
      try {
        recent = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, number>
      } catch { return }
      const now = Date.now()
      recent = Object.fromEntries(Object.entries(recent).filter(([, time]) => now - time < 300_000))
      if (recent[eventId]) return
      recent[eventId] = now
      try { localStorage.setItem(key, JSON.stringify(recent)) } catch { return }
      await publishCodexBrowserNotification(kind, () => {
        if (auth.principal?.subject_id === owner) void navigateTo(target)
      })
    })
  }

  watch(() => auth.principal?.subject_id, () => {
    initialized = false
    knownApprovals.clear()
    knownThreads.clear()
  })
  watch([
    () => approvals.initialized,
    () => approvals.pending,
    () => session.hostThreads,
  ], ([ready, pending, threads]) => {
    if (!ready) return
    if (initialized) {
      for (const approval of pending) {
        if (!knownApprovals.has(approval.approval_id)) {
          void notifyOnce(`approval:${approval.approval_id}`, CodexBrowserNotificationKind.Approval, CODEX_APPROVALS_ROUTE)
        }
      }
      for (const thread of threads) {
        if (knownThreads.get(thread.upstream_thread_id) !== CodexThreadStatus.Active) continue
        const kind = thread.status === CodexThreadStatus.Idle ? CodexBrowserNotificationKind.Completed
          : thread.status === CodexThreadStatus.Failed ? CodexBrowserNotificationKind.Failed : null
        if (kind) void notifyOnce(`${thread.host_id}:${thread.upstream_thread_id}:${thread.updated_at}:${kind}`, kind,
          buildCodexTaskRoute(thread.upstream_thread_id, {hostId: thread.host_id, workspaceId: thread.workspace_id}))
      }
    }
    knownApprovals = new Set(pending.map(item => item.approval_id))
    knownThreads = new Map(threads.map(item => [item.upstream_thread_id, item.status]))
    initialized = true
  }, {deep: true, immediate: true})
})
