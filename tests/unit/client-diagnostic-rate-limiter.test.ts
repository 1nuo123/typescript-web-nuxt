import { describe, expect, it } from 'vitest'
import {
  CLIENT_DIAGNOSTIC_RATE_LIMIT_PER_MINUTE,
  CLIENT_DIAGNOSTIC_RATE_LIMIT_WINDOW_MILLISECONDS,
  ClientDiagnosticRateLimiter,
} from '../../app/utils/client-diagnostic-rate-limiter'

describe('ClientDiagnosticRateLimiter', () => {
  it('limits each subject and fingerprint to twenty diagnostics per minute', () => {
    const limiter = new ClientDiagnosticRateLimiter()
    const now = 1_000

    for (
      let index = 0;
      index < CLIENT_DIAGNOSTIC_RATE_LIMIT_PER_MINUTE;
      index += 1
    ) {
      expect(limiter.allows('subject-1', 'vue:client.error', now)).toBe(true)
    }
    expect(limiter.allows('subject-1', 'vue:client.error', now)).toBe(false)
    expect(limiter.allows('subject-1', 'window:client.error', now)).toBe(true)
    expect(limiter.allows('subject-2', 'vue:client.error', now)).toBe(true)
  })

  it('opens a new window at the retention boundary', () => {
    const limiter = new ClientDiagnosticRateLimiter()
    const now = 1_000

    for (
      let index = 0;
      index < CLIENT_DIAGNOSTIC_RATE_LIMIT_PER_MINUTE;
      index += 1
    ) {
      limiter.allows('subject-1', 'vue:client.error', now)
    }
    expect(
      limiter.allows(
        'subject-1',
        'vue:client.error',
        now + CLIENT_DIAGNOSTIC_RATE_LIMIT_WINDOW_MILLISECONDS,
      ),
    ).toBe(true)
  })
})
