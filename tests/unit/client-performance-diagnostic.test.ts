import { describe, expect, it } from 'vitest'
import {
  ClientPerformanceMetric,
  ClientPerformanceObservation,
} from '../../app/types/app'
import {
  CLIENT_PERFORMANCE_DIAGNOSTIC_MAXIMUM_ENTRIES,
  ClientPerformanceDiagnosticCollector,
} from '../../app/utils/client-performance-diagnostic'

const buildCollector = (
  enabled: boolean,
): ClientPerformanceDiagnosticCollector =>
  new ClientPerformanceDiagnosticCollector({
    enabled,
    sessionKey: 'anonymous-session-key',
    sampleRate: 1,
    createEventId: () => 'performance-event-1',
    now: () => new Date('2026-08-19T00:00:00.000Z'),
  })

describe('ClientPerformanceDiagnosticCollector', () => {
  it('keeps collection disabled unless the explicit feature switch is enabled', () => {
    const collector = buildCollector(false)

    const entry = collector.record({
      metric: ClientPerformanceMetric.ApproximateFps,
      observation: ClientPerformanceObservation.Observed,
      value: 58,
    })

    expect(entry).toBeNull()
    expect(collector.readEntries()).toEqual([])
  })

  it('builds a typed in-memory envelope without session or route identifiers', () => {
    const collector = buildCollector(true)

    const entry = collector.record({
      metric: ClientPerformanceMetric.ApproximateFps,
      observation: ClientPerformanceObservation.Observed,
      value: 58,
    })

    expect(entry).toMatchObject({
      header: {
        kind: 'client_performance',
        schema_version: '1.0',
        event_id: 'performance-event-1',
        occurred_at: '2026-08-19T00:00:00.000Z',
      },
      detail: {
        kind: 'client_performance_detail',
        metric: 'approximate_fps',
        observation: 'observed',
        unit: 'frames_per_second',
        value: 58,
      },
    })
    expect(JSON.stringify(entry)).not.toContain('anonymous-session-key')
    expect(JSON.stringify(entry)).not.toContain('threadId')
  })

  it('rejects incompatible metric observations and out-of-range values before buffering', () => {
    const collector = buildCollector(true)

    const invalidObservation = collector.record({
      metric: ClientPerformanceMetric.ApproximateFps,
      observation: ClientPerformanceObservation.SocketClosed,
      value: 58,
    })
    const invalidValue = collector.record({
      metric: ClientPerformanceMetric.RealtimeBatchEventCount,
      observation: ClientPerformanceObservation.NormalBatch,
      value: 65,
    })

    expect(invalidObservation).toBeNull()
    expect(invalidValue).toBeNull()
    expect(collector.readEntries()).toEqual([])
  })

  it('bounds memory and releases entries explicitly without persistent storage', () => {
    const collector = buildCollector(true)
    for (
      let index = 0;
      index < CLIENT_PERFORMANCE_DIAGNOSTIC_MAXIMUM_ENTRIES + 1;
      index += 1
    ) {
      collector.record({
        metric: ClientPerformanceMetric.ApproximateFps,
        observation: ClientPerformanceObservation.Observed,
        value: 58,
      })
    }

    expect(collector.readEntries()).toHaveLength(
      CLIENT_PERFORMANCE_DIAGNOSTIC_MAXIMUM_ENTRIES,
    )
    collector.clear()
    expect(collector.readEntries()).toEqual([])
  })
})
