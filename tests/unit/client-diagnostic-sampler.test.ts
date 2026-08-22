import { describe, expect, it } from 'vitest'
import {
  CLIENT_DIAGNOSTIC_PERFORMANCE_SAMPLE_RATE,
  isClientDiagnosticPerformanceSampled,
} from '../../app/utils/client-diagnostic-sampler'

describe('isClientDiagnosticPerformanceSampled', () => {
  it('keeps the decision stable for the same anonymous session key', () => {
    const decisions = Array.from({ length: 10 }, () =>
      isClientDiagnosticPerformanceSampled('opaque-session-key'),
    )

    expect(new Set(decisions).size).toBe(1)
  })

  it('honors disabled and full-sample boundaries without storing session data', () => {
    expect(isClientDiagnosticPerformanceSampled('session-a', 0)).toBe(false)
    expect(isClientDiagnosticPerformanceSampled('', 1)).toBe(false)
    expect(isClientDiagnosticPerformanceSampled('session-a', 1)).toBe(true)
  })

  it('uses the fixed ten percent default rate', () => {
    expect(CLIENT_DIAGNOSTIC_PERFORMANCE_SAMPLE_RATE).toBe(0.1)
  })
})
