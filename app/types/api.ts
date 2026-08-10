export const API_AUTHORIZATION_HEADER_NAME = 'Authorization'
export const DEFAULT_DEVELOPMENT_API_BASE_URL = 'http://127.0.0.1:8000'
export const DEFAULT_PRODUCTION_API_BASE_URL = ''
export const DEFAULT_API_TIMEOUT_MS = 10_000
export const MIN_API_TIMEOUT_MS = 1
export const API_URL_PARSE_BASE = 'http://localhost'
export const API_CONTRACT_ERROR_STATUS_CODE = 502
export const API_CONTRACT_ERROR_STATUS_MESSAGE = 'Bad Gateway'
export const API_EXTERNAL_REQUEST_ERROR_STATUS_CODE = 400
export const API_EXTERNAL_REQUEST_ERROR_STATUS_MESSAGE = 'Bad Request'
export const API_EXTERNAL_REQUEST_ERROR_MESSAGE =
  '受保护请求不允许发送到未配置的外部地址。'

export const parseRuntimeApiTimeout = (value: unknown) => {
  const parsedTimeout = Number(value)

  return Number.isFinite(parsedTimeout) && parsedTimeout >= MIN_API_TIMEOUT_MS
    ? parsedTimeout
    : DEFAULT_API_TIMEOUT_MS
}

export enum ApiAuthStrategy {
  Public = 'public',
  Protected = 'protected',
}

export enum ApiClientErrorCode {
  ExternalProtectedRequest = 'api.external_protected_request',
}

export enum ApiContractErrorCode {
  AdminEnvelopeInvalid = 'api.admin_envelope_invalid',
}

export interface ApiErrorPayload {
  statusCode: number
  statusMessage: string
  message: string
  code?: string
  errorCode?: string
  requestId?: string
  traceId?: string
  kind?: string
  data?: unknown
  cause?: unknown
}

export interface ApiClientOptions {
  baseURL?: string
  timeout?: number
  getToken?: () => MaybePromise<string | null | undefined>
  onError?: (error: ApiErrorPayload) => MaybePromise<void>
  publicPaths?: readonly string[]
}

export interface ApiRequestMeta {
  authStrategy?: ApiAuthStrategy
  skipAuth?: boolean
  skipRefresh?: boolean
}

export interface ApiRequestResolutionInput {
  url: string
  baseURL: string
  meta?: ApiRequestMeta
  publicPaths: readonly string[]
}

export interface ResolvedApiRequest {
  requestPath: string
  isAbsoluteRequest: boolean
  isConfiguredOrigin: boolean
  shouldSkipAuth: boolean
}

export type ApiRequestOptions = NonNullable<Parameters<typeof $fetch>[1]> & {
  meta?: ApiRequestMeta
}

export type ApiRequestBody = ApiRequestOptions['body']

type MaybePromise<T> = T | Promise<T>

export enum ResponseEnvelopeCode {
  Success = 'system.success.ok',
}

export enum HttpFaultKind {
  HttpFault = 'http_fault',
}

export interface ResponseEnvelopeHeader {
  code: string
  message: string
  request_id: string
  trace_id?: string | null
}

export interface ApiResponseEnvelope<TData = unknown> {
  header: ResponseEnvelopeHeader
  data: TData
}

export interface HttpFaultPayload {
  kind: HttpFaultKind.HttpFault
  schema_version: string
  status_code: number
  error_code: string
}

export interface AdminEnvelopeHeader<
  TKind extends string = string,
  TOperationName extends string = string,
> {
  kind: TKind
  schema_version: string
  operation_name: TOperationName
}

export interface AdminEnvelope<
  TDetail = unknown,
  TKind extends string = string,
  TOperationName extends string = string,
> {
  header: AdminEnvelopeHeader<TKind, TOperationName>
  detail: TDetail
}

export interface AdminEnvelopeValidationOptions {
  expectedKind?: string
  expectedOperationName?: string
  expectedSchemaVersion?: string
}

export interface OffsetPage<TItem> {
  kind?: string
  schema_version?: string
  items: TItem[]
  page_size: number
  offset: number
  total: number
}

export interface LimitFeed<TItem> {
  kind?: string
  schema_version?: string
  items: TItem[]
  limit?: number
}
