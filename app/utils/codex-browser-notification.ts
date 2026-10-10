/** Codex 浏览器通知只允许固定事件类型，绝不将会话内容带入操作系统通知。 */
export enum CodexBrowserNotificationKind {
  Approval = 'approval',
  Completed = 'completed',
  Failed = 'failed',
}

const NOTIFICATION_BODY: Readonly<
  Record<CodexBrowserNotificationKind, string>
> = {
  [CodexBrowserNotificationKind.Approval]: '有新的 Codex 审批请求。',
  [CodexBrowserNotificationKind.Completed]: 'Codex 会话已完成。',
  [CodexBrowserNotificationKind.Failed]: 'Codex 会话执行失败。',
}
const CODEX_NOTIFICATION_TARGET = '/codex/approval-center'

export type CodexBrowserNotificationPermission =
  | NotificationPermission
  | 'unsupported'

/** 读取浏览器能力而不触发提示框；权限提示只能由明确的用户点击请求。 */
export const readCodexBrowserNotificationPermission =
  (): CodexBrowserNotificationPermission =>
    typeof Notification === 'undefined'
      ? 'unsupported'
      : Notification.permission

/** Chromium 的 Notification.permission 可能缓存旧值，主动检测优先读取实时权限。 */
export const refreshCodexBrowserNotificationPermission =
  async (): Promise<CodexBrowserNotificationPermission> => {
    if (typeof Notification === 'undefined') return 'unsupported'
    try {
      const permission = await navigator.permissions.query({ name: 'notifications' })
      return permission.state === 'prompt' ? 'default' : permission.state
    } catch {
      return Notification.permission
    }
  }

/** 请求系统通知授权。调用方必须直接绑定到用户手势，避免页面加载时弹窗。 */
export const requestCodexBrowserNotificationPermission =
  async (): Promise<CodexBrowserNotificationPermission> => {
    if (typeof Notification === 'undefined') return 'unsupported'
    return Notification.requestPermission()
  }

/** 发布不包含用户数据的固定通知；未授权时安静跳过。 */
export const publishCodexBrowserNotification = async (
  kind: CodexBrowserNotificationKind,
  onOpen?: () => void,
): Promise<void> => {
  if (await refreshCodexBrowserNotificationPermission() !== 'granted') return
  const notification = new Notification('Codex', {
    body: NOTIFICATION_BODY[kind],
    silent: false,
  })
  // 系统通知不携带会话标识；目标仅保存在当前页面的回调中。
  notification.onclick = () => {
    window.focus()
    notification.close()
    if (onOpen) onOpen()
    else window.location.assign(CODEX_NOTIFICATION_TARGET)
  }
}
