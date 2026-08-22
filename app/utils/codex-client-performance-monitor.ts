import {
  ClientPerformanceMetric,
  ClientPerformanceObservation,
  type ClientPerformanceDiagnosticMeasurement,
} from '../types/app'

export const CODEX_PERFORMANCE_FPS_WINDOW_MS = 5_000

export interface CodexClientLongTaskObserver {
  disconnect(): void
}

export interface CodexClientPerformanceMonitorOptions {
  record: (measurement: ClientPerformanceDiagnosticMeasurement) => void
  requestAnimationFrame: (callback: FrameRequestCallback) => number
  cancelAnimationFrame: (requestId: number) => void
  isPageVisible: () => boolean
  now?: () => number
  createLongTaskObserver?: (
    onLongTask: (durationMilliseconds: number) => void,
  ) => CodexClientLongTaskObserver | null
  fpsWindowMilliseconds?: number
}

/**
 * 只在当前页面生命周期内采集长任务与近似帧率。
 *
 * 该对象不持有任何会话、路由或业务正文，只向调用方给出的受限记录器发送数值枚举；
 * stop 后必须取消 RAF 并释放 PerformanceObserver，避免卸载页面继续采样。
 */
export class CodexClientPerformanceMonitor {
  private readonly record: (
    measurement: ClientPerformanceDiagnosticMeasurement,
  ) => void
  private readonly requestAnimationFrame: (
    callback: FrameRequestCallback,
  ) => number
  private readonly cancelAnimationFrame: (requestId: number) => void
  private readonly isPageVisible: () => boolean
  private readonly now: () => number
  private readonly createLongTaskObserver: (
    onLongTask: (durationMilliseconds: number) => void,
  ) => CodexClientLongTaskObserver | null
  private readonly fpsWindowMilliseconds: number
  private active = false
  private frameRequestId: number | null = null
  private longTaskObserver: CodexClientLongTaskObserver | null = null
  private framesInWindow = 0
  private fpsWindowStartedAt = 0

  constructor(options: CodexClientPerformanceMonitorOptions) {
    this.record = options.record
    this.requestAnimationFrame = options.requestAnimationFrame
    this.cancelAnimationFrame = options.cancelAnimationFrame
    this.isPageVisible = options.isPageVisible
    this.now = options.now ?? (() => performance.now())
    this.createLongTaskObserver = options.createLongTaskObserver ?? (() => null)
    this.fpsWindowMilliseconds =
      options.fpsWindowMilliseconds ?? CODEX_PERFORMANCE_FPS_WINDOW_MS
  }

  /** 启动一次采样循环；重复调用不得产生第二个 RAF 或 observer。 */
  start(): void {
    if (this.active) return
    this.active = true
    this.resetFpsWindow()
    this.longTaskObserver = this.createLongTaskObserver(
      (durationMilliseconds) => this.recordLongTask(durationMilliseconds),
    )
    this.requestNextFrame()
  }

  /** 页面卸载时释放全部浏览器资源，之后 observer/RAF 回调不可再记录样本。 */
  stop(): void {
    this.active = false
    if (this.frameRequestId !== null) {
      this.cancelAnimationFrame(this.frameRequestId)
      this.frameRequestId = null
    }
    this.longTaskObserver?.disconnect()
    this.longTaskObserver = null
    this.framesInWindow = 0
  }

  private requestNextFrame(): void {
    if (!this.active) return
    this.frameRequestId = this.requestAnimationFrame(() => {
      this.frameRequestId = null
      this.recordAnimationFrame()
      this.requestNextFrame()
    })
  }

  private recordAnimationFrame(): void {
    if (!this.active) return
    const now = this.now()
    if (!this.isPageVisible()) {
      this.framesInWindow = 0
      this.fpsWindowStartedAt = now
      return
    }
    this.framesInWindow += 1
    const elapsedMilliseconds = now - this.fpsWindowStartedAt
    if (elapsedMilliseconds < this.fpsWindowMilliseconds) return
    const fps = (this.framesInWindow * 1_000) / elapsedMilliseconds
    this.record({
      metric: ClientPerformanceMetric.ApproximateFps,
      observation: ClientPerformanceObservation.Observed,
      value: Math.min(240, Math.max(0, fps)),
    })
    this.resetFpsWindow(now)
  }

  private recordLongTask(durationMilliseconds: number): void {
    if (!this.active || !Number.isFinite(durationMilliseconds)) return
    this.record({
      metric: ClientPerformanceMetric.LongTaskDurationMilliseconds,
      observation: ClientPerformanceObservation.Detected,
      value: Math.min(60_000, Math.max(0, durationMilliseconds)),
    })
  }

  private resetFpsWindow(startedAt = this.now()): void {
    this.framesInWindow = 0
    this.fpsWindowStartedAt = startedAt
  }
}
