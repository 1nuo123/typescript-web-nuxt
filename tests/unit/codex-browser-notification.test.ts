import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CodexBrowserNotificationKind,
  publishCodexBrowserNotification,
  readCodexBrowserNotificationPermission,
  requestCodexBrowserNotificationPermission,
} from '../../app/utils/codex-browser-notification'

describe('Codex browser notifications', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not request permission while only reading capability', () => {
    const requestPermission = vi.fn()
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission,
    })

    expect(readCodexBrowserNotificationPermission()).toBe('default')
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('requests permission only through the explicit action', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission,
    })

    await expect(requestCodexBrowserNotificationPermission()).resolves.toBe(
      'granted',
    )
    expect(requestPermission).toHaveBeenCalledOnce()
  })

  it('publishes fixed generic text without any supplied content', () => {
    const notification = vi.fn()
    vi.stubGlobal(
      'Notification',
      Object.assign(notification, { permission: 'granted' }),
    )

    publishCodexBrowserNotification(CodexBrowserNotificationKind.Approval)
    publishCodexBrowserNotification(CodexBrowserNotificationKind.Completed)
    publishCodexBrowserNotification(CodexBrowserNotificationKind.Failed)

    expect(notification.mock.calls).toEqual([
      ['Codex', { body: '有新的 Codex 审批请求。', silent: false }],
      ['Codex', { body: 'Codex 会话已完成。', silent: false }],
      ['Codex', { body: 'Codex 会话执行失败。', silent: false }],
    ])
  })

  it('does not publish before the user grants permission', () => {
    const notification = vi.fn()
    vi.stubGlobal(
      'Notification',
      Object.assign(notification, { permission: 'denied' }),
    )

    publishCodexBrowserNotification(CodexBrowserNotificationKind.Approval)

    expect(notification).not.toHaveBeenCalled()
  })

  it('returns to the fixed Remote entry when the user clicks a notification', () => {
    const focus = vi.fn()
    const assign = vi.fn()
    const notifications: Array<{ onclick: (() => void) | null }> = []
    class TestNotification {
      onclick: (() => void) | null = null

      constructor() {
        notifications.push(this)
      }
    }
    vi.stubGlobal('window', {
      focus,
      location: { assign },
    })
    vi.stubGlobal(
      'Notification',
      Object.assign(TestNotification, { permission: 'granted' }),
    )

    publishCodexBrowserNotification(CodexBrowserNotificationKind.Completed)
    notifications[0]?.onclick?.()

    expect(focus).toHaveBeenCalledOnce()
    expect(assign).toHaveBeenCalledWith('/codex')
  })
})
