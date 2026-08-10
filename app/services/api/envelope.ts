import type {
  AdminEnvelope,
  AdminEnvelopeValidationOptions,
  ApiErrorPayload,
  ApiResponseEnvelope,
  ResponseEnvelopeHeader,
} from '~/types/api'
import {
  API_CONTRACT_ERROR_STATUS_CODE,
  API_CONTRACT_ERROR_STATUS_MESSAGE,
  ApiContractErrorCode,
  HttpFaultKind,
  ResponseEnvelopeCode,
} from '~/types/api'

const ADMIN_ENVELOPE_ERRORS = {
  MISSING_HEADER: '后台管理响应缺少 data.header。',
  MISSING_DETAIL: '后台管理响应缺少 data.detail。',
  MISSING_SCHEMA_VERSION: '后台管理响应缺少 data.header.schema_version。',
  UNEXPECTED_SCHEMA_VERSION: '后台管理响应 schema_version 与客户端契约不一致。',
  UNEXPECTED_KIND: '后台管理响应 kind 与客户端契约不一致。',
  UNEXPECTED_OPERATION: '后台管理响应 operation_name 与客户端契约不一致。',
} as const

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const hasEnvelopeHeader = (value: unknown): value is ResponseEnvelopeHeader => {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    typeof value.request_id === 'string'
  )
}

const readString = (value: unknown) => {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined
}

const readNumber = (value: unknown) => {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

const createAdminEnvelopeError = (
  message: string,
  data: unknown,
): ApiErrorPayload => ({
  statusCode: API_CONTRACT_ERROR_STATUS_CODE,
  statusMessage: API_CONTRACT_ERROR_STATUS_MESSAGE,
  message,
  code: ApiContractErrorCode.AdminEnvelopeInvalid,
  errorCode: ApiContractErrorCode.AdminEnvelopeInvalid,
  data,
})

export const isResponseEnvelope = <T = unknown>(
  value: unknown,
): value is ApiResponseEnvelope<T> => {
  return isRecord(value) && hasEnvelopeHeader(value.header) && 'data' in value
}

export const unwrapResponseEnvelope = <T>(
  envelope: ApiResponseEnvelope<T> | T,
): T => {
  if (isResponseEnvelope<T>(envelope)) {
    if (envelope.header.code !== ResponseEnvelopeCode.Success) {
      const data = isRecord(envelope.data) ? envelope.data : undefined

      throw {
        statusCode:
          readNumber(data?.status_code) ?? API_CONTRACT_ERROR_STATUS_CODE,
        statusMessage: envelope.header.message,
        message: envelope.header.message,
        code: envelope.header.code,
        errorCode: readString(data?.error_code) ?? envelope.header.code,
        requestId: envelope.header.request_id,
        traceId: readString(envelope.header.trace_id),
        kind: readString(data?.kind) ?? HttpFaultKind.HttpFault,
        data: envelope.data,
      } satisfies ApiErrorPayload
    }

    return envelope.data
  }

  return envelope
}

export const unwrapAdminEnvelope = <T>(
  envelope: ApiResponseEnvelope<AdminEnvelope<T>> | AdminEnvelope<T>,
  options: AdminEnvelopeValidationOptions = {},
): T => {
  const data = unwrapResponseEnvelope(envelope)

  if (!isRecord(data)) {
    throw createAdminEnvelopeError(ADMIN_ENVELOPE_ERRORS.MISSING_HEADER, data)
  }

  const header = isRecord(data.header) ? data.header : undefined

  if (!header) {
    throw createAdminEnvelopeError(ADMIN_ENVELOPE_ERRORS.MISSING_HEADER, data)
  }

  if (typeof header.schema_version !== 'string') {
    throw createAdminEnvelopeError(
      ADMIN_ENVELOPE_ERRORS.MISSING_SCHEMA_VERSION,
      data,
    )
  }

  if (
    options.expectedSchemaVersion &&
    header.schema_version !== options.expectedSchemaVersion
  ) {
    throw createAdminEnvelopeError(
      ADMIN_ENVELOPE_ERRORS.UNEXPECTED_SCHEMA_VERSION,
      data,
    )
  }

  if (options.expectedKind && header.kind !== options.expectedKind) {
    throw createAdminEnvelopeError(ADMIN_ENVELOPE_ERRORS.UNEXPECTED_KIND, data)
  }

  if (
    options.expectedOperationName &&
    header.operation_name !== options.expectedOperationName
  ) {
    throw createAdminEnvelopeError(
      ADMIN_ENVELOPE_ERRORS.UNEXPECTED_OPERATION,
      data,
    )
  }

  if ('detail' in data) {
    return data.detail as T
  }

  throw createAdminEnvelopeError(ADMIN_ENVELOPE_ERRORS.MISSING_DETAIL, data)
}
