import { describe, expect, it } from 'vitest'
import { CodexRealtimeConnectionStatus } from '../../app/types/codex-realtime'
import {
  getCodexRealtimeWriteBlockReason,
  type CodexRealtimeWriteOperation,
} from '../../app/utils/codex-realtime-write-guard'

describe('Codex realtime write guard', () => {
  it.each([
    [
      CodexRealtimeConnectionStatus.Offline,
      'turn_submission',
      '当前离线，不能发送新消息。',
    ],
    [
      CodexRealtimeConnectionStatus.AuthBlocked,
      'approval',
      '登录状态已失效，不能提交审批。',
    ],
    [
      CodexRealtimeConnectionStatus.Resyncing,
      'interrupt',
      '实时状态同步中，暂时不能中断。',
    ],
    [
      CodexRealtimeConnectionStatus.Resyncing,
      'compact',
      '实时状态同步中，暂时不能压缩会话。',
    ],
  ] as const)(
    'returns a deterministic %s block reason for %s',
    (status, operation, expected) => {
      expect(
        getCodexRealtimeWriteBlockReason(
          status,
          operation as CodexRealtimeWriteOperation,
        ),
      ).toBe(expected)
    },
  )

  it('allows writes after the connection returns to a writable state', () => {
    expect(
      getCodexRealtimeWriteBlockReason(
        CodexRealtimeConnectionStatus.Connected,
        'approval',
      ),
    ).toBeNull()
  })
})
