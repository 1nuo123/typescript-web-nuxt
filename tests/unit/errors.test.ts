import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { getDisplayError, normalizeApiError } from '../../app/utils/errors'
import {
  API_CONTRACT_ERROR_STATUS_CODE,
  API_CONTRACT_ERROR_STATUS_MESSAGE,
  ApiContractErrorCode,
  HttpFaultKind,
} from '../../app/types/api'
import { AuthErrorCode } from '../../app/types/auth'

const APP_ROOT_PATH = fileURLToPath(
  new URL('../../app/app.vue', import.meta.url),
)
const CONTRACT_REQUEST_ID = 'request-contract'
const CONTRACT_TRACE_ID = 'trace-contract'
const REQUEST_DIAGNOSTIC_LABEL_CONSTANT = 'REQUEST_DIAGNOSTIC_LABEL'
const TRACE_DIAGNOSTIC_LABEL_CONSTANT = 'TRACE_DIAGNOSTIC_LABEL'
const REQUEST_DIAGNOSTIC_LABEL = 'request_id'
const TRACE_DIAGNOSTIC_LABEL = 'trace_id'

describe('error utilities', () => {
  it('normalizes fetch-like errors', () => {
    const normalized = normalizeApiError({
      statusCode: 422,
      statusMessage: 'Validation Error',
      data: { message: 'Invalid payload' },
    })

    expect(normalized).toMatchObject({
      statusCode: 422,
      statusMessage: 'Validation Error',
      message: 'Invalid payload',
    })
  })

  it('normalizes backend envelope faults', () => {
    const normalized = normalizeApiError({
      statusCode: 401,
      data: {
        header: {
          code: AuthErrorCode.TokenExpired,
          message: '访问令牌已过期。',
          request_id: 'request-1',
          trace_id: 'trace-1',
        },
        data: {
          kind: HttpFaultKind.HttpFault,
          schema_version: '1.0',
          status_code: 401,
          error_code: AuthErrorCode.TokenExpired,
        },
      },
    })

    expect(normalized).toMatchObject({
      statusCode: 401,
      message: '访问令牌已过期。',
      code: AuthErrorCode.TokenExpired,
      errorCode: AuthErrorCode.TokenExpired,
      requestId: 'request-1',
      traceId: 'trace-1',
      kind: HttpFaultKind.HttpFault,
    })
  })

  it('normalizes direct API contract error payloads', () => {
    const normalized = normalizeApiError({
      statusCode: API_CONTRACT_ERROR_STATUS_CODE,
      statusMessage: API_CONTRACT_ERROR_STATUS_MESSAGE,
      message: '后台管理响应 kind 与客户端契约不一致。',
      code: ApiContractErrorCode.AdminEnvelopeInvalid,
      errorCode: ApiContractErrorCode.AdminEnvelopeInvalid,
      requestId: CONTRACT_REQUEST_ID,
      traceId: CONTRACT_TRACE_ID,
      kind: 'admin_contract',
    })

    expect(normalized).toMatchObject({
      statusCode: API_CONTRACT_ERROR_STATUS_CODE,
      statusMessage: API_CONTRACT_ERROR_STATUS_MESSAGE,
      errorCode: ApiContractErrorCode.AdminEnvelopeInvalid,
      requestId: CONTRACT_REQUEST_ID,
      traceId: CONTRACT_TRACE_ID,
      kind: 'admin_contract',
    })
  })

  it('creates display metadata for not found errors', () => {
    expect(getDisplayError({ statusCode: 404, message: '缺失' })).toEqual({
      title: '页面未找到',
      description: '缺失',
      statusCode: 404,
      requestId: undefined,
      traceId: undefined,
    })
  })

  it('keeps runtime error boundary diagnostics copy and retry actions wired', () => {
    const appRoot = readFileSync(APP_ROOT_PATH, 'utf8')

    expect(appRoot).toContain('navigator.clipboard.writeText')
    expect(appRoot).toContain(REQUEST_DIAGNOSTIC_LABEL_CONSTANT)
    expect(appRoot).toContain(TRACE_DIAGNOSTIC_LABEL_CONSTANT)
    expect(appRoot).toContain(REQUEST_DIAGNOSTIC_LABEL)
    expect(appRoot).toContain(TRACE_DIAGNOSTIC_LABEL)
    expect(appRoot).toContain('window.location.reload()')
  })
})
