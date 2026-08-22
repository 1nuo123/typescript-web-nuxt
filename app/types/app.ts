import type {
  AdminBoundaryPolicy,
  AuthRoleKey,
  AuthScopeCode,
  PermissionMode,
} from './auth'

export type ThemePreference = 'light' | 'dark' | 'system'

export type ResolvedTheme = 'light' | 'dark'

export const DEFAULT_APP_NAME = '应用骨架'

export enum RuntimeFeatureFlag {
  AdminOps = 'adminOpsEnabled',
  Codex = 'codexFeatureEnabled',
}

export interface AppNavItem {
  label: string
  to: string
  exact?: boolean
  disabled?: boolean
  requiresAuth?: boolean
  requiredRoles?: AuthRoleKey[]
  requiredScopes?: AuthScopeCode[]
  permissionMode?: PermissionMode
  adminBoundaryPolicy?: AdminBoundaryPolicy
  requiredRuntimeFlag?: RuntimeFeatureFlag
}

export enum RuntimeLogSource {
  Vue = 'vue',
  Window = 'window',
  Promise = 'promise',
  Request = 'request',
  Manual = 'manual',
}

export const RUNTIME_ERROR_STATUS_CODE = 500
export const RUNTIME_ERROR_STATUS_MESSAGE = 'Runtime Error'
export const RUNTIME_ERROR_FALLBACK_MESSAGE = '应用运行时错误。'
export const SERVER_RUNTIME_ERROR_FALLBACK_MESSAGE = '应用服务端运行时错误。'

/** 客户端诊断信封固定版本，避免任意异常对象、会话正文或浏览器 URL 扩散到日志链路。 */
export const CLIENT_DIAGNOSTIC_SCHEMA_VERSION = '1.0'

export enum ClientDiagnosticSummary {
  VueError = 'vue_error',
  WindowError = 'window_error',
  PromiseRejection = 'promise_rejection',
  RequestFailure = 'request_failure',
  ManualCapture = 'manual_capture',
}

/** 客户端诊断头与后端 Pydantic 合同同构，拒绝使用自由文本标识来源。 */
export interface ClientDiagnosticHeader {
  kind: 'client_diagnostic'
  schema_version: typeof CLIENT_DIAGNOSTIC_SCHEMA_VERSION
  event_id: string
  source: RuntimeLogSource
  occurred_at: string
}

/** 客户端诊断详情仅保留受限枚举、错误码和派生指纹。 */
export interface ClientDiagnosticDetail {
  kind: 'client_diagnostic_detail'
  schema_version: typeof CLIENT_DIAGNOSTIC_SCHEMA_VERSION
  summary: ClientDiagnosticSummary
  error_code: string
  fingerprint: string
}

/** 仅允许枚举、稳定错误码和派生指纹的客户端诊断载荷。 */
export interface ClientDiagnosticEnvelope {
  header: ClientDiagnosticHeader
  detail: ClientDiagnosticDetail
}

/** 后端接收诊断后的最小回执，不回传主体、会话或限流实现细节。 */
export interface ClientDiagnosticReceipt {
  recorded: boolean
}

/** 兼容现有内存日志状态名称，实际内容是受控的诊断信封。 */
export type RuntimeLogEntry = ClientDiagnosticEnvelope

/** 性能诊断固定版本；其数据只允许进入当前标签页内存或显式受控传输。 */
export const CLIENT_PERFORMANCE_DIAGNOSTIC_SCHEMA_VERSION = '1.0'

/** 性能样本的测量名称与后端 Pydantic 枚举保持同构，禁止动态指标名。 */
export enum ClientPerformanceMetric {
  ScrollStateTransition = 'scroll_state_transition',
  ScrollUnexpectedDetach = 'scroll_unexpected_detach',
  ScrollAnchorCorrectionPixels = 'scroll_anchor_correction_pixels',
  RealtimeBatchEventCount = 'realtime_batch_event_count',
  RealtimeBatchBytes = 'realtime_batch_bytes',
  ReducerDurationMilliseconds = 'reducer_duration_milliseconds',
  MarkdownDurationMilliseconds = 'markdown_duration_milliseconds',
  LongTaskDurationMilliseconds = 'long_task_duration_milliseconds',
  ApproximateFps = 'approximate_fps',
  SendAckLatencyMilliseconds = 'send_ack_latency_milliseconds',
  DuplicateOperation = 'duplicate_operation',
  ReconnectAttempt = 'reconnect_attempt',
  CursorGap = 'cursor_gap',
  SnapshotReplayEventCount = 'snapshot_replay_event_count',
  AuthTerminal = 'auth_terminal',
  StalledTransition = 'stalled_transition',
  ApprovalDeliveryLatencyMilliseconds = 'approval_delivery_latency_milliseconds',
  PwaLegacyController = 'pwa_legacy_controller',
  PwaLegacyCache = 'pwa_legacy_cache',
}

/** 性能样本上下文是封闭枚举，避免把原因、URL 或异常文本写入诊断。 */
export enum ClientPerformanceObservation {
  FollowingToDetached = 'following_to_detached',
  DetachedToFollowing = 'detached_to_following',
  RestoringToFollowing = 'restoring_to_following',
  UnexpectedDetach = 'unexpected_detach',
  AnchorCorrected = 'anchor_corrected',
  NormalBatch = 'normal_batch',
  BarrierBatch = 'barrier_batch',
  Observed = 'observed',
  Detected = 'detected',
  Acknowledged = 'acknowledged',
  Duplicate = 'duplicate',
  NetworkOnline = 'network_online',
  VisibilityResume = 'visibility_resume',
  SocketClosed = 'socket_closed',
  RetryTimer = 'retry_timer',
  Replayed = 'replayed',
  Terminal = 'terminal',
  Stalled = 'stalled',
  Delivered = 'delivered',
  DeliveryFailed = 'delivery_failed',
  LegacyControllerDetected = 'legacy_controller_detected',
  LegacyCacheDetected = 'legacy_cache_detected',
}

/** 性能数值的固定单位，服务端会按测量名称二次校验。 */
export enum ClientPerformanceUnit {
  Count = 'count',
  Bytes = 'bytes',
  Milliseconds = 'milliseconds',
  Pixels = 'pixels',
  FramesPerSecond = 'frames_per_second',
}

/** 性能诊断头不包含用户、会话、线程、路由或认证标识。 */
export interface ClientPerformanceDiagnosticHeader {
  kind: 'client_performance'
  schema_version: typeof CLIENT_PERFORMANCE_DIAGNOSTIC_SCHEMA_VERSION
  event_id: string
  occurred_at: string
}

/** 性能诊断详情只保留固定枚举、单位和数值。 */
export interface ClientPerformanceDiagnosticDetail {
  kind: 'client_performance_detail'
  schema_version: typeof CLIENT_PERFORMANCE_DIAGNOSTIC_SCHEMA_VERSION
  metric: ClientPerformanceMetric
  observation: ClientPerformanceObservation
  unit: ClientPerformanceUnit
  value: number
}

/** 不含自由文本的客户端性能诊断信封。 */
export interface ClientPerformanceDiagnosticEnvelope {
  header: ClientPerformanceDiagnosticHeader
  detail: ClientPerformanceDiagnosticDetail
}

/** 后端接收性能样本后的最小回执，不扩散服务端采样和留存策略。 */
export interface ClientPerformanceDiagnosticReceipt {
  recorded: boolean
}

/** 供滚动、实时连接和 PWA 退场路径提交的受限性能测量输入。 */
export interface ClientPerformanceDiagnosticMeasurement {
  metric: ClientPerformanceMetric
  observation: ClientPerformanceObservation
  value: number
}
