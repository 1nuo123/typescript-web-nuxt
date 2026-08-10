import type { ApiErrorPayload } from '~/types/api'

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const readString = (value: unknown) => {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined
}

const readNumber = (value: unknown) => {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

const readResponseData = (error: Record<string, unknown>) => {
  const response = isRecord(error.response) ? error.response : undefined

  return (
    (isRecord(error.data) && error.data) ||
    (isRecord(response?._data) && response?._data) ||
    (isRecord(response?.data) && response?.data) ||
    undefined
  )
}

export const normalizeApiError = (error: unknown): ApiErrorPayload => {
  if (!isRecord(error)) {
    return {
      statusCode: 500,
      statusMessage: '未知错误',
      message: '发生未知请求错误。',
      cause: error,
    }
  }

  const response = isRecord(error.response) ? error.response : undefined
  const data = readResponseData(error)
  const envelopeHeader = isRecord(data?.header) ? data.header : undefined
  const envelopeData = isRecord(data?.data) ? data.data : undefined
  const statusCode =
    readNumber(envelopeData?.status_code) ??
    readNumber(error.statusCode) ??
    readNumber(error.status) ??
    readNumber(response?.status) ??
    500

  const statusMessage =
    readString(error.statusMessage) ??
    readString(envelopeHeader?.message) ??
    readString(response?.statusText) ??
    '请求错误'

  const message =
    readString(envelopeHeader?.message) ??
    (isRecord(data) ? readString(data.message) : undefined) ??
    (isRecord(data) ? readString(data.detail) : undefined) ??
    readString(error.message) ??
    statusMessage

  const traceId = readString(envelopeHeader?.trace_id)
  const errorCode =
    readString(envelopeData?.error_code) ?? readString(error.errorCode)
  const code =
    readString(envelopeHeader?.code) ?? readString(error.code) ?? errorCode

  return {
    statusCode,
    statusMessage,
    message,
    code,
    errorCode,
    requestId:
      readString(envelopeHeader?.request_id) ?? readString(error.requestId),
    traceId: traceId ?? readString(error.traceId),
    kind: readString(envelopeData?.kind) ?? readString(error.kind),
    data,
    cause: error,
  }
}

export const getDisplayError = (error: unknown) => {
  const normalized = normalizeApiError(error)

  return {
    title:
      normalized.statusCode === 404
        ? '页面未找到'
        : normalized.statusCode === 403
          ? '无权访问'
          : normalized.statusCode === 429
            ? '请求过于频繁'
            : normalized.statusCode >= 500
              ? '服务暂不可用'
              : '请求错误',
    description: normalized.message,
    statusCode: normalized.statusCode,
    requestId: normalized.requestId,
    traceId: normalized.traceId,
  }
}
