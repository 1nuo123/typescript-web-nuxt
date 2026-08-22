import { describe, expect, it } from 'vitest'
import {
  ClientPerformanceMetric,
  ClientPerformanceObservation,
  type ClientPerformanceDiagnosticMeasurement,
} from '../../app/types/app'
import { CodexClientPerformanceMonitor } from '../../app/utils/codex-client-performance-monitor'

describe('CodexClientPerformanceMonitor', () => {
  it('records a bounded approximate FPS value for a visible frame window', () => {
    let now = 0
    let nextFrame: FrameRequestCallback | null = null
    const measurements: ClientPerformanceDiagnosticMeasurement[] = []
    const monitor = new CodexClientPerformanceMonitor({
      record: (measurement) => measurements.push(measurement),
      requestAnimationFrame: (callback) => {
        nextFrame = callback
        return 1
      },
      cancelAnimationFrame: () => undefined,
      isPageVisible: () => true,
      now: () => now,
      fpsWindowMilliseconds: 1_000,
    })

    monitor.start()
    for (let frame = 1; frame <= 60; frame += 1) {
      now = (frame * 1_000) / 60
      const callback = nextFrame
      nextFrame = null
      callback?.(now)
    }

    expect(measurements).toContainEqual({
      metric: ClientPerformanceMetric.ApproximateFps,
      observation: ClientPerformanceObservation.Observed,
      value: 60,
    })
  })

  it('does not report a hidden-page frame window and resets when visible again', () => {
    let now = 0
    let visible = false
    let nextFrame: FrameRequestCallback | null = null
    const measurements: ClientPerformanceDiagnosticMeasurement[] = []
    const monitor = new CodexClientPerformanceMonitor({
      record: (measurement) => measurements.push(measurement),
      requestAnimationFrame: (callback) => {
        nextFrame = callback
        return 1
      },
      cancelAnimationFrame: () => undefined,
      isPageVisible: () => visible,
      now: () => now,
      fpsWindowMilliseconds: 100,
    })

    monitor.start()
    now = 1_000
    nextFrame?.(now)
    expect(measurements).toEqual([])

    visible = true
    for (const frameTime of [1_050, 1_100, 1_150]) {
      now = frameTime
      const callback = nextFrame
      nextFrame = null
      callback?.(now)
    }
    expect(measurements).toContainEqual({
      metric: ClientPerformanceMetric.ApproximateFps,
      observation: ClientPerformanceObservation.Observed,
      value: 20,
    })
  })

  it('records supported long tasks and releases both observer and RAF on stop', () => {
    let onLongTask: ((durationMilliseconds: number) => void) | null = null
    let canceledRequestId: number | null = null
    let disconnected = false
    const measurements: ClientPerformanceDiagnosticMeasurement[] = []
    const monitor = new CodexClientPerformanceMonitor({
      record: (measurement) => measurements.push(measurement),
      requestAnimationFrame: () => 42,
      cancelAnimationFrame: (requestId) => {
        canceledRequestId = requestId
      },
      isPageVisible: () => true,
      createLongTaskObserver: (callback) => {
        onLongTask = callback
        return {
          disconnect: () => {
            disconnected = true
          },
        }
      },
    })

    monitor.start()
    onLongTask?.(75)
    onLongTask?.(100_000)
    monitor.stop()
    onLongTask?.(32)

    expect(measurements).toEqual([
      {
        metric: ClientPerformanceMetric.LongTaskDurationMilliseconds,
        observation: ClientPerformanceObservation.Detected,
        value: 75,
      },
      {
        metric: ClientPerformanceMetric.LongTaskDurationMilliseconds,
        observation: ClientPerformanceObservation.Detected,
        value: 60_000,
      },
    ])
    expect(canceledRequestId).toBe(42)
    expect(disconnected).toBe(true)
  })
})
