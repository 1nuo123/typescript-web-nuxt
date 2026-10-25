import {
  CLIENT_PERFORMANCE_DIAGNOSTIC_SCHEMA_VERSION,
  ClientPerformanceMetric,
  ClientPerformanceObservation,
  ClientPerformanceUnit,
  type ClientPerformanceDiagnosticEnvelope,
  type ClientPerformanceDiagnosticMeasurement,
} from '../types/app'
import { isClientDiagnosticPerformanceSampled } from './client-diagnostic-sampler'

export const CLIENT_PERFORMANCE_DIAGNOSTIC_MAXIMUM_ENTRIES = 100

interface ClientPerformanceMetricDefinition {
  unit: ClientPerformanceUnit
  maximumValue: number
  observations: readonly ClientPerformanceObservation[]
}

/** 前后端共享的性能词表在浏览器侧镜像，用于在生成信封前拒绝无效组合。 */
const clientPerformanceMetricDefinitions: Readonly<
  Record<ClientPerformanceMetric, ClientPerformanceMetricDefinition>
> = {
  [ClientPerformanceMetric.ScrollStateTransition]: {
    unit: ClientPerformanceUnit.Count,
    maximumValue: 1,
    observations: [
      ClientPerformanceObservation.FollowingToDetached,
      ClientPerformanceObservation.DetachedToFollowing,
      ClientPerformanceObservation.RestoringToFollowing,
    ],
  },
  [ClientPerformanceMetric.ScrollUnexpectedDetach]: {
    unit: ClientPerformanceUnit.Count,
    maximumValue: 1,
    observations: [ClientPerformanceObservation.UnexpectedDetach],
  },
  [ClientPerformanceMetric.ScrollAnchorCorrectionPixels]: {
    unit: ClientPerformanceUnit.Pixels,
    maximumValue: 1_048_576,
    observations: [ClientPerformanceObservation.AnchorCorrected],
  },
  [ClientPerformanceMetric.RealtimeBatchEventCount]: {
    unit: ClientPerformanceUnit.Count,
    maximumValue: 64,
    observations: [
      ClientPerformanceObservation.NormalBatch,
      ClientPerformanceObservation.BarrierBatch,
    ],
  },
  [ClientPerformanceMetric.RealtimeBatchBytes]: {
    unit: ClientPerformanceUnit.Bytes,
    maximumValue: 65_536,
    observations: [
      ClientPerformanceObservation.NormalBatch,
      ClientPerformanceObservation.BarrierBatch,
    ],
  },
  [ClientPerformanceMetric.ReducerDurationMilliseconds]: {
    unit: ClientPerformanceUnit.Milliseconds,
    maximumValue: 60_000,
    observations: [ClientPerformanceObservation.Observed],
  },
  [ClientPerformanceMetric.MarkdownDurationMilliseconds]: {
    unit: ClientPerformanceUnit.Milliseconds,
    maximumValue: 60_000,
    observations: [ClientPerformanceObservation.Observed],
  },
  [ClientPerformanceMetric.LongTaskDurationMilliseconds]: {
    unit: ClientPerformanceUnit.Milliseconds,
    maximumValue: 60_000,
    observations: [ClientPerformanceObservation.Detected],
  },
  [ClientPerformanceMetric.ApproximateFps]: {
    unit: ClientPerformanceUnit.FramesPerSecond,
    maximumValue: 240,
    observations: [ClientPerformanceObservation.Observed],
  },
  [ClientPerformanceMetric.SendAckLatencyMilliseconds]: {
    unit: ClientPerformanceUnit.Milliseconds,
    maximumValue: 300_000,
    observations: [ClientPerformanceObservation.Acknowledged],
  },
  [ClientPerformanceMetric.DuplicateOperation]: {
    unit: ClientPerformanceUnit.Count,
    maximumValue: 1,
    observations: [ClientPerformanceObservation.Duplicate],
  },
  [ClientPerformanceMetric.ConnectionRecoveryMilliseconds]: {
    unit: ClientPerformanceUnit.Milliseconds,
    maximumValue: 300_000,
    observations: [ClientPerformanceObservation.Observed],
  },
  [ClientPerformanceMetric.AuthorityRecoveryMilliseconds]: {
    unit: ClientPerformanceUnit.Milliseconds,
    maximumValue: 300_000,
    observations: [ClientPerformanceObservation.Observed],
  },
  [ClientPerformanceMetric.HistoryLoadMilliseconds]: {
    unit: ClientPerformanceUnit.Milliseconds,
    maximumValue: 300_000,
    observations: [ClientPerformanceObservation.Observed],
  },
  [ClientPerformanceMetric.ReconnectAttempt]: {
    unit: ClientPerformanceUnit.Count,
    maximumValue: 1,
    observations: [
      ClientPerformanceObservation.NetworkOnline,
      ClientPerformanceObservation.VisibilityResume,
      ClientPerformanceObservation.SocketClosed,
      ClientPerformanceObservation.RetryTimer,
    ],
  },
  [ClientPerformanceMetric.CursorGap]: {
    unit: ClientPerformanceUnit.Count,
    maximumValue: 1,
    observations: [ClientPerformanceObservation.Detected],
  },
  [ClientPerformanceMetric.SnapshotReplayEventCount]: {
    unit: ClientPerformanceUnit.Count,
    maximumValue: 10_000,
    observations: [ClientPerformanceObservation.Replayed],
  },
  [ClientPerformanceMetric.AuthTerminal]: {
    unit: ClientPerformanceUnit.Count,
    maximumValue: 1,
    observations: [ClientPerformanceObservation.Terminal],
  },
  [ClientPerformanceMetric.StalledTransition]: {
    unit: ClientPerformanceUnit.Count,
    maximumValue: 1,
    observations: [ClientPerformanceObservation.Stalled],
  },
  [ClientPerformanceMetric.ApprovalDeliveryLatencyMilliseconds]: {
    unit: ClientPerformanceUnit.Milliseconds,
    maximumValue: 300_000,
    observations: [
      ClientPerformanceObservation.Delivered,
      ClientPerformanceObservation.DeliveryFailed,
    ],
  },
  [ClientPerformanceMetric.PwaLegacyController]: {
    unit: ClientPerformanceUnit.Count,
    maximumValue: 1,
    observations: [ClientPerformanceObservation.LegacyControllerDetected],
  },
  [ClientPerformanceMetric.PwaLegacyCache]: {
    unit: ClientPerformanceUnit.Count,
    maximumValue: 1,
    observations: [ClientPerformanceObservation.LegacyCacheDetected],
  },
}

export interface ClientPerformanceDiagnosticCollectorOptions {
  enabled?: boolean
  sessionKey: string
  sampleRate?: number
  createEventId?: () => string
  now?: () => Date
  onRecord?: (entry: ClientPerformanceDiagnosticEnvelope) => void
}

/**
 * 只在当前页面内存保存已采样的性能信封。
 *
 * 收集器没有 HTTP、WebSocket、Storage 或 Service Worker 依赖。后续传输必须由独立
 * 的显式开关和跨实例限流方案启用，不能通过本类隐式添加自动上传。
 */
export class ClientPerformanceDiagnosticCollector {
  private readonly enabled: boolean
  private readonly sampled: boolean
  private readonly createEventId: () => string
  private readonly now: () => Date
  private readonly onRecord:
    | ((entry: ClientPerformanceDiagnosticEnvelope) => void)
    | null
  private readonly entries: ClientPerformanceDiagnosticEnvelope[] = []

  constructor(options: ClientPerformanceDiagnosticCollectorOptions) {
    this.enabled = options.enabled ?? false
    this.sampled = isClientDiagnosticPerformanceSampled(
      options.sessionKey,
      options.sampleRate,
    )
    this.createEventId = options.createEventId ?? createClientPerformanceEventId
    this.now = options.now ?? (() => new Date())
    this.onRecord = options.onRecord ?? null
  }

  /** 在开关和会话采样均允许时验证并生成一条内存性能信封。 */
  record(
    measurement: ClientPerformanceDiagnosticMeasurement,
  ): ClientPerformanceDiagnosticEnvelope | null {
    if (!this.enabled || !this.sampled) return null
    const definition = clientPerformanceMetricDefinitions[measurement.metric]
    if (
      !Number.isFinite(measurement.value) ||
      measurement.value < 0 ||
      measurement.value > definition.maximumValue ||
      !definition.observations.includes(measurement.observation)
    ) {
      return null
    }
    const entry: ClientPerformanceDiagnosticEnvelope = {
      header: {
        kind: 'client_performance',
        schema_version: CLIENT_PERFORMANCE_DIAGNOSTIC_SCHEMA_VERSION,
        event_id: this.createEventId(),
        occurred_at: this.now().toISOString(),
      },
      detail: {
        kind: 'client_performance_detail',
        schema_version: CLIENT_PERFORMANCE_DIAGNOSTIC_SCHEMA_VERSION,
        metric: measurement.metric,
        observation: measurement.observation,
        unit: definition.unit,
        value: measurement.value,
      },
    }
    this.entries.push(entry)
    if (this.entries.length > CLIENT_PERFORMANCE_DIAGNOSTIC_MAXIMUM_ENTRIES) {
      this.entries.splice(
        0,
        this.entries.length - CLIENT_PERFORMANCE_DIAGNOSTIC_MAXIMUM_ENTRIES,
      )
    }
    try {
      this.onRecord?.(entry)
    } catch {
      // 可选旁路回调不能破坏已验证的内存采样或触发递归诊断。
    }
    return entry
  }

  /** 返回不可变副本，调用方不能借此修改收集器内部已验证样本。 */
  readEntries(): readonly ClientPerformanceDiagnosticEnvelope[] {
    return this.entries.slice()
  }

  /** 页面卸载或明确关闭采集时释放内存样本，禁止持久化或转移给其他标签页。 */
  clear(): void {
    this.entries.length = 0
  }
}

const createClientPerformanceEventId = (): string => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
