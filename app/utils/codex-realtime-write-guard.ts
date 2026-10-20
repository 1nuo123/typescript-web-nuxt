import { CodexRealtimeConnectionStatus } from '../types/codex-realtime'
import {
  CodexCapabilityCode,
  CodexHostCompatibilityState,
  CodexHostStatus,
  type CodexHost,
} from '../types/codex-host'

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
  host?: CodexHost | null,
): string | null => {
  if (host !== undefined) {
    if (
      !host ||
      host.status === CodexHostStatus.Offline ||
      host.status === CodexHostStatus.Revoked
    )
      return '目标电脑尚未就绪，请先恢复连接。'
    if (host.compatibility.state !== CodexHostCompatibilityState.Compatible)
      return '电脑已连接，当前 Codex 版本的此项功能尚未适配。'
    const capabilities = host.capabilities.items.map((item) => item.code)
    const required = {
      turn_submission: CodexCapabilityCode.TurnStart,
      interrupt: CodexCapabilityCode.TurnInterrupt,
      compact: CodexCapabilityCode.ThreadCompact,
    }
    if (operation !== 'approval' && !capabilities.includes(required[operation]))
      return '当前电脑尚未开放此项功能。'
  }
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
      if (operation === 'interrupt') return null
      return `实时状态同步中，暂时不能${action}。`
    case CodexRealtimeConnectionStatus.Connected:
      return null
    default:
      if (operation === 'interrupt') return null
      return `连接尚未就绪，暂时不能${action}。`
  }
}
