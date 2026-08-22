import { CodexRealtimeConnectionStatus } from '../types/codex-realtime'

/** 受实时连接权威状态约束的 Codex 写操作类别。 */
export type CodexRealtimeWriteOperation =
  | 'turn_submission'
  | 'approval'
  | 'interrupt'
  | 'compact'

const WRITE_OPERATION_LABELS: Record<CodexRealtimeWriteOperation, string> = {
  turn_submission: '发送新消息',
  approval: '提交审批',
  interrupt: '中断',
  compact: '压缩会话',
}

/**
 * 只依据连接状态机判断写入资格，保证页面、快捷键和 store 入口不会在认证终态或
 * 权威快照恢复期间产生新的副作用。返回 null 表示调用方仍需完成自身的权限和参数校验。
 */
export const getCodexRealtimeWriteBlockReason = (
  status: CodexRealtimeConnectionStatus,
  operation: CodexRealtimeWriteOperation,
): string | null => {
  const action =
    status === CodexRealtimeConnectionStatus.Resyncing &&
    operation === 'turn_submission'
      ? '发送消息'
      : WRITE_OPERATION_LABELS[operation]
  switch (status) {
    case CodexRealtimeConnectionStatus.Offline:
      return `当前离线，不能${action}。`
    case CodexRealtimeConnectionStatus.AuthBlocked:
      return `登录状态已失效，不能${action}。`
    case CodexRealtimeConnectionStatus.Resyncing:
      return `实时状态同步中，暂时不能${action}。`
    default:
      return null
  }
}
