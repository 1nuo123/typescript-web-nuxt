import type { AdminEnvelope } from './api'

export const ADMIN_TASK_SCHEMA_VERSION = '1.0'
export const ADMIN_SETTINGS_RELOAD_SCHEMA_VERSION = '1.0'
export const ADMIN_LOG_SCHEMA_VERSION = '1.0'
export const ADMIN_SYSTEM_SCHEMA_VERSION = '1.0'
export const ADMIN_OPS_DEFAULT_LIMIT = 50

export enum AdminTaskOperationName {
  ExecutionList = 'execution_list',
  ExecutionRecord = 'execution_record',
  RuntimeRead = 'runtime_read',
  RegistrationList = 'registration_list',
  Dispatch = 'dispatch',
  DispatchResult = 'dispatch_result',
}

export enum AdminTaskPayloadKind {
  ExecutionList = 'admin_task_execution_list',
  ExecutionRecord = 'admin_task_execution_record',
  ExecutionRuntime = 'admin_task_execution_runtime',
  Runtime = 'admin_task_runtime',
  Registration = 'admin_task_registration',
  RegistrationList = 'admin_task_registration_list',
  Dispatch = 'admin_task_dispatch',
  DispatchResult = 'admin_task_dispatch_result',
}

export enum TaskExecutionStatus {
  Pending = 'PENDING',
  Reserved = 'RESERVED',
  Published = 'PUBLISHED',
  Running = 'RUNNING',
  Retrying = 'RETRYING',
  Success = 'SUCCESS',
  Failed = 'FAILED',
}

export enum TaskExecutionStage {
  Dispatch = 'dispatch',
  LocalExecution = 'local_execution',
  ConsumeExecution = 'consume_execution',
  StartupProbe = 'startup_probe',
}

export enum TaskBackend {
  Local = 'local',
  Funboost = 'funboost',
}

export enum TaskRuntimeMode {
  LocalInline = 'local_inline',
  LocalQueued = 'local_queued',
  FunboostProducer = 'funboost_producer',
  FunboostConsumer = 'funboost_consumer',
}

export enum MessageBusBackend {
  Local = 'local',
  Rabbitmq = 'rabbitmq',
}

export enum AdminSettingsReloadOperationName {
  ReadCandidate = 'read_candidate',
  ApplyReload = 'apply_reload',
  ReloadResult = 'reload_result',
}

export enum AdminSettingsReloadKind {
  Candidate = 'admin_settings_reload_candidate',
  Request = 'admin_settings_reload',
  Result = 'admin_settings_reload_result',
}

export enum AdminLogOperationName {
  LogRecordList = 'log_record_list',
  SecurityEventList = 'security_event_list',
}

export enum AdminLogPayloadKind {
  LogRecordList = 'admin_log_record_list',
  SecurityEventList = 'admin_security_event_list',
}

export enum LogLevel {
  Debug = 'DEBUG',
  Info = 'INFO',
  Warning = 'WARNING',
  Error = 'ERROR',
  Critical = 'CRITICAL',
}

export enum LogEventKind {
  Access = 'access',
  Exception = 'exception',
  ResourceLifecycle = 'resource_lifecycle',
  TaskFailure = 'task_failure',
  Security = 'security',
}

export enum SecurityEventSeverity {
  Info = 'info',
  Warning = 'warning',
  High = 'high',
}

export enum SecurityEventDecision {
  Allow = 'allow',
  Deny = 'deny',
  Throttle = 'throttle',
  RecordOnly = 'record_only',
}

export enum RuntimeResourceStatus {
  Created = 'created',
  Starting = 'starting',
  Ready = 'ready',
  Failed = 'failed',
  Stopping = 'stopping',
  Stopped = 'stopped',
}

export interface AdminTaskExecutionRuntimePayload {
  kind: AdminTaskPayloadKind.ExecutionRuntime
  schema_version: string
  status: TaskExecutionStatus
  stage: TaskExecutionStage
  attempt_count: number
  started_at_epoch: number | null
  finished_at_epoch: number | null
  failed_at_epoch: number | null
  next_retry_at_epoch: number | null
  last_error_type: string | null
  last_error_message: string | null
}

export interface AdminTaskExecutionRecordPayload {
  kind: AdminTaskPayloadKind.ExecutionRecord
  schema_version: string
  record_id: string
  task_id: string
  job_kind: string
  deduplication_key: string
  backend: TaskBackend
  queue_name: string
  request_id: string
  trace_id: string | null
  created_at_epoch: number
  runtime: AdminTaskExecutionRuntimePayload
}

export interface AdminTaskExecutionListPayload {
  kind: AdminTaskPayloadKind.ExecutionList
  schema_version: string
  records: AdminTaskExecutionRecordPayload[]
}

export interface AdminTaskRuntimePayload {
  kind: AdminTaskPayloadKind.Runtime
  schema_version: string
  task_runtime_mode: TaskRuntimeMode
  task_backend: TaskBackend
  transport_backend: MessageBusBackend
  configured_transport_backend: MessageBusBackend
  worker_enabled: boolean
  inline_execute_enabled: boolean
  default_job_kind: string
  default_retry_limit: number
}

export interface AdminTaskRegistrationPayload {
  kind: AdminTaskPayloadKind.Registration
  schema_version: string
  task_name: string
  job_kind: string
  enabled: boolean
  registration_backend: TaskBackend
  current_runtime_backend: TaskBackend
  active_for_current_runtime: boolean
  handler_bound: boolean
  payload_model_name: string | null
  retry_limit: number | null
  queue_name: string | null
  exchange_name: string | null
  routing_key: string | null
}

export interface AdminTaskRegistrationListPayload {
  kind: AdminTaskPayloadKind.RegistrationList
  schema_version: string
  registrations: AdminTaskRegistrationPayload[]
}

export interface AdminTaskDispatchDetail {
  kind: AdminTaskPayloadKind.Dispatch
  schema_version: string
  job_kind: string
  payload_json: string
  retry_limit?: number | null
  deduplication_key?: string | null
}

export interface AdminTaskDispatchResultPayload {
  kind: AdminTaskPayloadKind.DispatchResult
  schema_version: string
  task_id: string
  job_kind: string
  dispatched: boolean
  retry_limit: number
  backend: TaskBackend
  queue_name: string
  published: boolean
  worker_enabled: boolean
  inline_execute_enabled: boolean | null
  execution_status: TaskExecutionStatus
  execution_stage: TaskExecutionStage
  reused_existing_record: boolean
}

export interface AdminSettingsReloadCandidatePayload {
  kind: AdminSettingsReloadKind.Candidate
  schema_version: string
  candidate_version: string
  digest: string
}

export interface AdminSettingsReloadRequestDetail {
  kind: AdminSettingsReloadKind.Request
  schema_version: string
}

export interface AdminSettingsReloadResultPayload {
  kind: AdminSettingsReloadKind.Result
  schema_version: string
  success: boolean
  rolled_back: boolean
  reason: string | null
  candidate_version: string | null
  restored_resources: string[]
  active_snapshot_id: string | null
}

/** 日志详情为后端按 kind 判别的脱敏联合结构,前端仅做展示透传。 */
export interface AdminLogRecordDetailPayload {
  kind: string
  schema_version: string
  [field: string]: unknown
}

export interface AdminLogRecordPayload {
  event_id: string
  event_kind: LogEventKind
  schema_version: string
  level: LogLevel
  message: string
  occurred_at: string
  request_id: string | null
  trace_id: string | null
  authenticated_subject_id: string | null
  source_module: string
  source_component: string
  detail: AdminLogRecordDetailPayload
}

export interface AdminLogRecordListPayload {
  kind: AdminLogPayloadKind.LogRecordList
  schema_version: string
  records: AdminLogRecordPayload[]
}

export interface SecurityEventHeaderPayload {
  kind: string
  schema_version: string
  event_type: string
  detail_kind: string
  severity: SecurityEventSeverity
  decision: SecurityEventDecision
  reason_code: string
  request_id: string
  trace_id: string | null
  path: string
  method: string
  status_code?: number | null
  subject_id?: string | null
  ip_digest?: string | null
  user_agent_digest?: string | null
  policy_name: string
  occurred_at_epoch: number
}

export interface SecurityEventEnvelopePayload {
  header: SecurityEventHeaderPayload
  detail: Record<string, unknown>
}

export interface AdminSecurityEventPayload {
  event_id: string
  log_level: LogLevel
  log_message: string
  occurred_at: string
  request_id: string | null
  trace_id: string | null
  source_module: string
  source_component: string
  security_event: SecurityEventEnvelopePayload
}

export interface AdminSecurityEventListPayload {
  kind: AdminLogPayloadKind.SecurityEventList
  schema_version: string
  events: AdminSecurityEventPayload[]
}

export interface AdminTaskQuery {
  status?: TaskExecutionStatus | ''
  job_kind?: string
  limit?: number
}

export interface AdminLogQuery {
  level?: LogLevel | ''
  event_kind?: LogEventKind | ''
  request_id?: string
  trace_id?: string
  occurred_from?: string
  occurred_to?: string
  limit?: number
}

export interface AdminSecurityEventQuery {
  event_type?: string
  severity?: SecurityEventSeverity | ''
  decision?: SecurityEventDecision | ''
  occurred_from?: string
  occurred_to?: string
  limit?: number
}

export interface RuntimeResourceStatePayload {
  kind: string
  schema_version: string
  resource_name: string
  status: RuntimeResourceStatus
  detail: string | null
}

export interface SystemOverviewAdminPayload {
  kind: string
  schema_version: string
  title: string
  application_name: string
  version: string
  environment: string
  enabled_modules: string[]
  ready: boolean
  resources: RuntimeResourceStatePayload[]
}

export interface HealthProbePayload {
  kind: string
  schema_version: string
  status: string
  ready: boolean
}

export type AdminTaskEnvelope<TDetail> = AdminEnvelope<
  TDetail,
  AdminTaskPayloadKind,
  AdminTaskOperationName
>

export type AdminSettingsReloadEnvelope<TDetail> = AdminEnvelope<
  TDetail,
  AdminSettingsReloadKind,
  AdminSettingsReloadOperationName
>

export type AdminLogEnvelope<TDetail> = AdminEnvelope<
  TDetail,
  AdminLogPayloadKind,
  AdminLogOperationName
>
