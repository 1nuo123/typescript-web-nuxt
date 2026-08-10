import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveApiRequest } from '~/composables/useApi'
import {
  API_AUTHORIZATION_HEADER_NAME,
  API_EXTERNAL_REQUEST_ERROR_STATUS_CODE,
  DEFAULT_API_TIMEOUT_MS,
  DEFAULT_DEVELOPMENT_API_BASE_URL,
  ApiAuthStrategy,
  ApiClientErrorCode,
  HttpFaultKind,
} from '~/types/api'
import {
  AUTH_BEARER_TOKEN_TYPE,
  AUTH_REFRESH_PATH,
  AUTH_REGISTER_PATH,
  AuthErrorCode,
} from '~/types/auth'

const API_BASE_URL = 'https://api.example.test'
const API_TIMEOUT_MS = 2_500
const ACCESS_TOKEN = 'token-value'
const REQUEST_ID = 'request-api'
const TRACE_ID = 'trace-api'
const PROTECTED_ADMIN_PATH = '/admin/users'
const EXTERNAL_PROTECTED_URL = 'https://evil.example.test/admin/users'
const EXTERNAL_PUBLIC_URL = 'https://public.example.test/status'

describe('useApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useRuntimeConfig().public.apiBaseURL = DEFAULT_DEVELOPMENT_API_BASE_URL
    useRuntimeConfig().public.apiTimeout = DEFAULT_API_TIMEOUT_MS
  })

  it('injects base options and token headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('$fetch', fetchMock)

    const api = useApi({
      baseURL: API_BASE_URL,
      timeout: API_TIMEOUT_MS,
      getToken: () => ACCESS_TOKEN,
    })

    await expect(api.get('/health')).resolves.toEqual({ ok: true })

    const firstCall = fetchMock.mock.calls[0]

    if (!firstCall) {
      throw new Error('Expected $fetch to be called')
    }

    const [, options] = firstCall
    expect(options).toMatchObject({
      baseURL: API_BASE_URL,
      timeout: API_TIMEOUT_MS,
      method: 'GET',
    })
    expect(
      (options.headers as Headers).get(API_AUTHORIZATION_HEADER_NAME),
    ).toBe(`${AUTH_BEARER_TOKEN_TYPE} ${ACCESS_TOKEN}`)
  })

  it('uses the development backend base URL when no explicit client base is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('$fetch', fetchMock)

    const api = useApi()

    await api.get('/health/live')

    const [, options] = fetchMock.mock.calls[0] ?? []

    expect(options).toMatchObject({
      baseURL: DEFAULT_DEVELOPMENT_API_BASE_URL,
      method: 'GET',
    })
  })

  it('normalizes request errors and calls the error hook', async () => {
    const onError = vi.fn()
    const fetchMock = vi.fn().mockRejectedValue({
      statusCode: 503,
      statusMessage: 'Service Unavailable',
      message: 'Offline',
    })
    vi.stubGlobal('$fetch', fetchMock)

    const api = useApi({ onError })

    await expect(api.get('/offline')).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'Service Unavailable',
      message: 'Offline',
    })
    expect(onError).toHaveBeenCalledOnce()
  })

  it('keeps the original request error when auth helpers fail', async () => {
    const onError = vi.fn().mockRejectedValue(new Error('hook failed'))
    const fetchMock = vi.fn().mockRejectedValue({
      statusCode: 503,
      statusMessage: 'Service Unavailable',
      message: 'Offline',
    })
    vi.stubGlobal('$fetch', fetchMock)

    const api = useApi({
      getToken: () => {
        throw new Error('token failed')
      },
      onError,
    })

    await expect(api.get('/offline')).rejects.toMatchObject({
      statusCode: 500,
      message: 'token failed',
    })
  })

  it('keeps the original request error when the error hook rejects', async () => {
    const onError = vi.fn().mockRejectedValue(new Error('hook failed'))
    const fetchMock = vi.fn().mockRejectedValue({
      statusCode: 503,
      statusMessage: 'Service Unavailable',
      message: 'Offline',
    })
    vi.stubGlobal('$fetch', fetchMock)

    const api = useApi({ onError })

    await expect(api.get('/offline')).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'Service Unavailable',
      message: 'Offline',
    })
    expect(onError).toHaveBeenCalledOnce()
  })

  it('does not attach authorization to built-in public auth endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('$fetch', fetchMock)

    const api = useApi({
      getToken: () => 'expired-token',
    })

    await api.post(AUTH_REFRESH_PATH, { refresh_token: 'refresh-token' })
    await api.post(AUTH_REGISTER_PATH, {
      username: 'new_user',
      password: 'registration-password',
    })

    expect(fetchMock.mock.calls).toHaveLength(2)
    for (const [, options] of fetchMock.mock.calls) {
      expect(
        (options.headers as Headers).has(API_AUTHORIZATION_HEADER_NAME),
      ).toBe(false)
    }
  })

  it('keeps authorization on protected endpoints after public whitelist checks', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('$fetch', fetchMock)

    const api = useApi({
      getToken: () => ACCESS_TOKEN,
    })

    await api.get(PROTECTED_ADMIN_PATH)

    const [, options] = fetchMock.mock.calls[0] ?? []

    expect(
      (options.headers as Headers).get(API_AUTHORIZATION_HEADER_NAME),
    ).toBe(`${AUTH_BEARER_TOKEN_TYPE} ${ACCESS_TOKEN}`)
  })

  it('resolves API request origin and auth strategy before token injection', () => {
    expect(
      resolveApiRequest({
        url: PROTECTED_ADMIN_PATH,
        baseURL: API_BASE_URL,
        publicPaths: [AUTH_REFRESH_PATH],
      }),
    ).toMatchObject({
      requestPath: PROTECTED_ADMIN_PATH,
      isAbsoluteRequest: false,
      isConfiguredOrigin: true,
      shouldSkipAuth: false,
    })
    expect(
      resolveApiRequest({
        url: `${API_BASE_URL}${PROTECTED_ADMIN_PATH}`,
        baseURL: API_BASE_URL,
        publicPaths: [AUTH_REFRESH_PATH],
      }),
    ).toMatchObject({
      requestPath: PROTECTED_ADMIN_PATH,
      isAbsoluteRequest: true,
      isConfiguredOrigin: true,
      shouldSkipAuth: false,
    })
    expect(
      resolveApiRequest({
        url: EXTERNAL_PUBLIC_URL,
        baseURL: API_BASE_URL,
        meta: { authStrategy: ApiAuthStrategy.Public },
        publicPaths: [AUTH_REFRESH_PATH],
      }),
    ).toMatchObject({
      requestPath: '/status',
      isAbsoluteRequest: true,
      isConfiguredOrigin: false,
      shouldSkipAuth: true,
    })
  })

  it('rejects protected absolute URLs outside the configured API origin', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('$fetch', fetchMock)

    const api = useApi({
      baseURL: API_BASE_URL,
      getToken: () => ACCESS_TOKEN,
    })

    await expect(api.get(EXTERNAL_PROTECTED_URL)).rejects.toMatchObject({
      statusCode: API_EXTERNAL_REQUEST_ERROR_STATUS_CODE,
      errorCode: ApiClientErrorCode.ExternalProtectedRequest,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('allows public absolute URLs without attaching authorization', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('$fetch', fetchMock)

    const api = useApi({
      baseURL: API_BASE_URL,
      getToken: () => ACCESS_TOKEN,
    })

    await api.get(EXTERNAL_PUBLIC_URL, {
      meta: { authStrategy: ApiAuthStrategy.Public },
    })

    const [, options] = fetchMock.mock.calls[0] ?? []

    expect(
      (options.headers as Headers).has(API_AUTHORIZATION_HEADER_NAME),
    ).toBe(false)
  })

  it('uses runtime timeout when no client timeout is passed', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('$fetch', fetchMock)
    useRuntimeConfig().public.apiTimeout = API_TIMEOUT_MS

    await useApi().get('/health/live')

    const [, options] = fetchMock.mock.calls[0] ?? []

    expect(options.timeout).toBe(API_TIMEOUT_MS)
  })

  it('normalizes envelope authorization and throttling faults', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce({
        statusCode: 403,
        data: {
          header: {
            code: AuthErrorCode.PermissionDenied,
            message: '权限不足。',
            request_id: REQUEST_ID,
            trace_id: TRACE_ID,
          },
          data: {
            kind: HttpFaultKind.HttpFault,
            schema_version: '1.0',
            status_code: 403,
            error_code: AuthErrorCode.PermissionDenied,
          },
        },
      })
      .mockRejectedValueOnce({
        statusCode: 429,
        data: {
          header: {
            code: AuthErrorCode.RequestThrottled,
            message: '请求过于频繁。',
            request_id: REQUEST_ID,
            trace_id: TRACE_ID,
          },
          data: {
            kind: HttpFaultKind.HttpFault,
            schema_version: '1.0',
            status_code: 429,
            error_code: AuthErrorCode.RequestThrottled,
          },
        },
      })
    vi.stubGlobal('$fetch', fetchMock)

    const api = useApi()

    await expect(api.get(PROTECTED_ADMIN_PATH)).rejects.toMatchObject({
      statusCode: 403,
      errorCode: AuthErrorCode.PermissionDenied,
      requestId: REQUEST_ID,
      traceId: TRACE_ID,
    })
    await expect(api.get(PROTECTED_ADMIN_PATH)).rejects.toMatchObject({
      statusCode: 429,
      errorCode: AuthErrorCode.RequestThrottled,
      kind: HttpFaultKind.HttpFault,
    })
  })
})
