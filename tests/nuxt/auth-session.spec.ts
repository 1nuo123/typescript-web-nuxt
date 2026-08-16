import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  API_AUTHORIZATION_HEADER_NAME,
  HttpFaultKind,
  ResponseEnvelopeCode,
} from '~/types/api'
import {
  AUTH_BEARER_TOKEN_TYPE,
  AUTH_ME_PATH,
  AUTH_BROWSER_REFRESH_PATH,
  AUTH_BROWSER_REVOKE_PATH,
  AUTH_BROWSER_TOKEN_PATH,
  AUTH_REGISTER_PATH,
  AUTH_STEP_UP_PATH,
  AuthErrorCode,
  AuthRole,
  AuthScope,
  AuthSessionStatus,
  AuthStepUpPurpose,
  type BrowserTokenIssuePayload,
} from '~/types/auth'

const successHeader = {
  code: ResponseEnvelopeCode.Success,
  message: 'ok',
  request_id: 'request-1',
  trace_id: 'trace-1',
}
const ADMIN_USERS_PATH = '/admin/users'
const AUTH_CREDENTIALS_INVALID_ERROR_CODE = 'auth.credentials.invalid'
const NON_SERIALIZABLE_STATUS_CODE = 500
const NON_SERIALIZABLE_STATUS_MESSAGE = 'Internal Server Error'
const NON_SERIALIZABLE_MESSAGE = 'unexpected backend error'
const NON_SERIALIZABLE_ERROR_CODE = 'system.runtime_error'
const NON_SERIALIZABLE_REQUEST_ID = 'request-non-serializable'
const NON_SERIALIZABLE_TRACE_ID = 'trace-non-serializable'
const NON_SERIALIZABLE_CAUSE_MESSAGE = 'non-serializable-cause'

const tokenEnvelope = (
  accessToken: string,
  _refreshToken?: string,
): { header: typeof successHeader; data: BrowserTokenIssuePayload } => ({
  header: successHeader,
  data: {
    kind: 'browser_token_issue' as const,
    schema_version: '1.0',
    access_token: accessToken,
    token_type: AUTH_BEARER_TOKEN_TYPE,
    expires_in_seconds: 900,
  },
})

const principalEnvelope = {
  header: successHeader,
  data: {
    kind: 'authenticated_principal',
    subject_id: 'subject-1',
    username: 'admin',
    roles: [AuthRole.Admin],
    scopes: [AuthScope.AuthRead, AuthScope.AuthManage],
    is_admin: true,
  },
}

const expiredError = {
  statusCode: 401,
  data: {
    header: {
      code: AuthErrorCode.TokenExpired,
      message: '访问令牌已过期。',
      request_id: 'request-expired',
      trace_id: 'trace-expired',
    },
    data: {
      kind: HttpFaultKind.HttpFault,
      schema_version: '1.0',
      status_code: 401,
      error_code: AuthErrorCode.TokenExpired,
    },
  },
}

const invalidLoginError = {
  statusCode: 401,
  data: {
    header: {
      code: AUTH_CREDENTIALS_INVALID_ERROR_CODE,
      message: '用户名或密码错误。',
      request_id: 'request-login-invalid',
      trace_id: 'trace-login-invalid',
    },
    data: {
      kind: HttpFaultKind.HttpFault,
      schema_version: '1.0',
      status_code: 401,
      error_code: AUTH_CREDENTIALS_INVALID_ERROR_CODE,
    },
  },
}

describe('auth session API flow', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore().$reset()
  })

  it('keeps access credentials only in memory and never exposes refresh credentials', async () => {
    const authStore = useAuthStore()
    authStore.applyTokenIssue(
      tokenEnvelope('cookie-access', 'cookie-refresh').data,
    )
    await nextTick()

    expect(authStore.accessToken).toBe('cookie-access')
    expect('refreshToken' in authStore).toBe(false)
    expect(document.cookie).not.toContain('cookie-access')
    expect(document.cookie).not.toContain('cookie-refresh')
  })

  it('logs in with JSON credentials and loads the current principal', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenEnvelope('login-access', 'login-refresh'))
      .mockResolvedValueOnce(principalEnvelope)
    vi.stubGlobal('$fetch', fetchMock)

    const authStore = useAuthStore()

    await authStore.login('admin', 'password')

    expect(authStore.status).toBe(AuthSessionStatus.Authenticated)
    expect(authStore.principal?.username).toBe('admin')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(AUTH_BROWSER_TOKEN_PATH)
    expect(fetchMock.mock.calls[0]?.[1].body).toEqual({
      username: 'admin',
      password: 'password',
    })
    expect(fetchMock.mock.calls[1]?.[0]).toBe(AUTH_ME_PATH)
  })

  it('registers with public credentials and establishes a browser session', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        header: successHeader,
        data: {
          kind: 'user_registration',
          schema_version: '1.0',
          subject_id: 'user-registered',
          username: 'new_user',
        },
      })
      .mockResolvedValueOnce(tokenEnvelope('registered-access'))
      .mockResolvedValueOnce({
        header: successHeader,
        data: {
          kind: 'authenticated_principal',
          subject_id: 'user-registered',
          username: 'new_user',
          roles: [AuthRole.RegisteredUser],
          scopes: [],
          is_admin: false,
        },
      })
    vi.stubGlobal('$fetch', fetchMock)

    const authStore = useAuthStore()

    await authStore.register('new_user', 'registration-password')

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      AUTH_REGISTER_PATH,
      AUTH_BROWSER_TOKEN_PATH,
      AUTH_ME_PATH,
    ])
    expect(fetchMock.mock.calls[0]?.[1].body).toEqual({
      username: 'new_user',
      password: 'registration-password',
    })
    expect(authStore.status).toBe(AuthSessionStatus.Authenticated)
    expect(authStore.principal?.roles).toEqual([AuthRole.RegisteredUser])
    expect(authStore.principal?.scopes).toEqual([])
  })

  it('binds a step-up grant to the requested high-risk operation', async () => {
    const grantToken = 'g'.repeat(64)
    const fetchMock = vi.fn().mockResolvedValue({
      header: successHeader,
      data: {
        grant_token: grantToken,
        expires_at: '2026-08-08T03:00:00Z',
      },
    })
    vi.stubGlobal('$fetch', fetchMock)
    const authStore = useAuthStore()
    authStore.applyTokenIssue(tokenEnvelope('step-up-access').data)

    await expect(
      authStore.issueStepUpGrant('password', AuthStepUpPurpose.CodexHostRevoke),
    ).resolves.toBe(grantToken)

    expect(fetchMock.mock.calls[0]?.[0]).toBe(AUTH_STEP_UP_PATH)
    expect(fetchMock.mock.calls[0]?.[1].body).toEqual({
      password: 'password',
      purpose: AuthStepUpPurpose.CodexHostRevoke,
    })
    expect(
      (fetchMock.mock.calls[0]?.[1].headers as Headers).get(
        API_AUTHORIZATION_HEADER_NAME,
      ),
    ).toBe(`${AUTH_BEARER_TOKEN_TYPE} step-up-access`)
  })

  it('resets login pending state when credentials are rejected', async () => {
    const fetchMock = vi.fn().mockRejectedValue(invalidLoginError)
    vi.stubGlobal('$fetch', fetchMock)

    const authStore = useAuthStore()

    await expect(
      authStore.login('admin', 'wrong-password'),
    ).rejects.toMatchObject({
      statusCode: 401,
      errorCode: AUTH_CREDENTIALS_INVALID_ERROR_CODE,
    })
    expect(authStore.status).toBe(AuthSessionStatus.Anonymous)
    expect(authStore.accessToken).toBe('')
    expect(authStore.lastError?.message).toBe('用户名或密码错误。')
  })

  it('keeps only serializable API error fields in store state', () => {
    const authStore = useAuthStore()

    authStore.consumeApiError({
      statusCode: NON_SERIALIZABLE_STATUS_CODE,
      statusMessage: NON_SERIALIZABLE_STATUS_MESSAGE,
      message: NON_SERIALIZABLE_MESSAGE,
      code: NON_SERIALIZABLE_ERROR_CODE,
      errorCode: NON_SERIALIZABLE_ERROR_CODE,
      requestId: NON_SERIALIZABLE_REQUEST_ID,
      traceId: NON_SERIALIZABLE_TRACE_ID,
      kind: HttpFaultKind.HttpFault,
      data: new Headers(),
      cause: new Error(NON_SERIALIZABLE_CAUSE_MESSAGE),
    })

    expect(authStore.status).toBe(AuthSessionStatus.Error)
    expect(authStore.lastError).toEqual({
      statusCode: NON_SERIALIZABLE_STATUS_CODE,
      statusMessage: NON_SERIALIZABLE_STATUS_MESSAGE,
      message: NON_SERIALIZABLE_MESSAGE,
      code: NON_SERIALIZABLE_ERROR_CODE,
      errorCode: NON_SERIALIZABLE_ERROR_CODE,
      requestId: NON_SERIALIZABLE_REQUEST_ID,
      traceId: NON_SERIALIZABLE_TRACE_ID,
      kind: HttpFaultKind.HttpFault,
    })
    expect('data' in (authStore.lastError ?? {})).toBe(false)
    expect('cause' in (authStore.lastError ?? {})).toBe(false)
  })

  it('keeps an authenticated session across transient server failures', () => {
    const authStore = useAuthStore()
    authStore.applyTokenIssue(
      tokenEnvelope('transient-access', 'transient-refresh').data,
    )
    authStore.principal = {
      kind: 'authenticated_principal',
      subject_id: 'subject-1',
      username: 'admin',
      roles: [],
      scopes: [],
      is_admin: false,
    }

    authStore.consumeApiError({
      statusCode: 503,
      statusMessage: 'Service Unavailable',
      message: 'backend unavailable',
    })

    expect(authStore.status).toBe(AuthSessionStatus.Authenticated)
    expect(authStore.accessToken).toBe('transient-access')
    expect(authStore.principal?.subject_id).toBe('subject-1')
  })

  it('refreshes once, atomically replaces tokens, and replays the request', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(expiredError)
      .mockResolvedValueOnce(tokenEnvelope('new-access', 'new-refresh'))
      .mockResolvedValueOnce(principalEnvelope)
      .mockResolvedValueOnce({ header: successHeader, data: { ok: true } })

    vi.stubGlobal('$fetch', fetchMock)

    const authStore = useAuthStore()
    authStore.applyTokenIssue(tokenEnvelope('old-access', 'old-refresh').data)

    const api = useAuthenticatedApi()

    await expect(api.get(ADMIN_USERS_PATH)).resolves.toEqual({
      header: successHeader,
      data: { ok: true },
    })

    expect(authStore.accessToken).toBe('new-access')

    const refreshCall = fetchMock.mock.calls[1]

    if (!refreshCall) {
      throw new Error('Expected refresh request')
    }

    const [, refreshOptions] = refreshCall

    expect(refreshCall[0]).toBe(AUTH_BROWSER_REFRESH_PATH)
    expect(
      (refreshOptions.headers as Headers).has(API_AUTHORIZATION_HEADER_NAME),
    ).toBe(false)
    expect(refreshOptions.body).toBeUndefined()
    expect(refreshOptions.credentials).toBe('include')

    const replayCall = fetchMock.mock.calls[3]

    if (!replayCall) {
      throw new Error('Expected replay request')
    }

    expect(
      (replayCall[1].headers as Headers).get(API_AUTHORIZATION_HEADER_NAME),
    ).toBe(`${AUTH_BEARER_TOKEN_TYPE} new-access`)
  })

  it('serializes refresh rotation through a browser-wide lock', async () => {
    const requestLock = vi.fn(
      async (_name: string, callback: () => Promise<boolean>) => callback(),
    )
    const testNavigator = Object.create(navigator) as Navigator
    Object.defineProperty(testNavigator, 'locks', {
      configurable: true,
      value: { request: requestLock },
    })
    vi.stubGlobal('navigator', testNavigator)
    vi.stubGlobal(
      '$fetch',
      vi
        .fn()
        .mockResolvedValueOnce(tokenEnvelope('locked-access'))
        .mockResolvedValueOnce(principalEnvelope),
    )

    await useAuthStore().refresh()

    expect(requestLock).toHaveBeenCalledTimes(1)
    expect(requestLock.mock.calls[0]?.[0]).toBe('auth-session-refresh')
    expect(useAuthStore().accessToken).toBe('locked-access')
  })

  it('shares authentication initialization and waits for refresh completion', async () => {
    let resolveRefresh: (
      value: ReturnType<typeof tokenEnvelope>,
    ) => void = () => undefined
    const refreshResponse = new Promise<ReturnType<typeof tokenEnvelope>>(
      (resolve) => {
        resolveRefresh = resolve
      },
    )
    const fetchMock = vi.fn((url: string) => {
      if (url === AUTH_BROWSER_REFRESH_PATH) return refreshResponse
      if (url === AUTH_ME_PATH) return Promise.resolve(principalEnvelope)
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('$fetch', fetchMock)
    const authStore = useAuthStore()

    const firstInitialization = authStore.initSession()
    const secondInitialization = authStore.initSession()
    await nextTick()

    expect(authStore.initialized).toBe(false)
    expect(
      fetchMock.mock.calls.filter(([url]) => url === AUTH_BROWSER_REFRESH_PATH),
    ).toHaveLength(1)

    resolveRefresh(tokenEnvelope('restored-access'))
    await Promise.all([firstInitialization, secondInitialization])

    expect(authStore.initialized).toBe(true)
    expect(authStore.status).toBe(AuthSessionStatus.Authenticated)
    expect(authStore.accessToken).toBe('restored-access')
    expect(authStore.principal?.username).toBe('admin')
  })

  it('does not replay expired requests when the HttpOnly refresh cookie is unavailable', async () => {
    const fetchMock = vi.fn().mockRejectedValue(expiredError)
    vi.stubGlobal('$fetch', fetchMock)

    const authStore = useAuthStore()
    authStore.applyTokenIssue(tokenEnvelope('old-access', 'old-refresh').data)
    const api = useAuthenticatedApi()

    await expect(api.get(ADMIN_USERS_PATH)).rejects.toMatchObject({
      statusCode: 401,
      errorCode: AuthErrorCode.TokenExpired,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(authStore.status).toBe(AuthSessionStatus.Anonymous)
  })

  it('does not self-refresh when /auth/me fails during refresh', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(expiredError)
      .mockResolvedValueOnce(tokenEnvelope('new-access', 'new-refresh'))
      .mockRejectedValueOnce(expiredError)

    vi.stubGlobal('$fetch', fetchMock)

    const authStore = useAuthStore()
    authStore.applyTokenIssue(tokenEnvelope('old-access', 'old-refresh').data)

    const api = useAuthenticatedApi()

    await expect(api.get(ADMIN_USERS_PATH)).rejects.toMatchObject({
      statusCode: 401,
      errorCode: AuthErrorCode.TokenExpired,
    })

    const refreshCalls = fetchMock.mock.calls.filter(
      ([url]) => url === AUTH_BROWSER_REFRESH_PATH,
    )
    const meCalls = fetchMock.mock.calls.filter(([url]) => url === AUTH_ME_PATH)

    expect(refreshCalls).toHaveLength(1)
    expect(meCalls).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not replay expired requests when the active session changes during refresh', async () => {
    const authStore = useAuthStore()
    authStore.applyTokenIssue(tokenEnvelope('old-access', 'old-refresh').data)

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(expiredError)
      .mockImplementationOnce(async () => {
        authStore.applyTokenIssue(
          tokenEnvelope('replacement-access', 'replacement-refresh').data,
        )
        return tokenEnvelope('new-access', 'new-refresh')
      })

    vi.stubGlobal('$fetch', fetchMock)

    const api = useAuthenticatedApi()

    await expect(api.get(ADMIN_USERS_PATH)).rejects.toMatchObject({
      statusCode: 401,
      errorCode: AuthErrorCode.TokenExpired,
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(ADMIN_USERS_PATH)
    expect(fetchMock.mock.calls[1]?.[0]).toBe(AUTH_BROWSER_REFRESH_PATH)
    expect(authStore.accessToken).toBe('replacement-access')
  })

  it('shares one refresh request across concurrent expired access requests', async () => {
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      const authorization = (options?.headers as Headers).get(
        API_AUTHORIZATION_HEADER_NAME,
      )

      if (
        url === ADMIN_USERS_PATH &&
        authorization === `${AUTH_BEARER_TOKEN_TYPE} old-access`
      ) {
        throw expiredError
      }

      if (url === AUTH_BROWSER_REFRESH_PATH) {
        return tokenEnvelope('new-access', 'new-refresh')
      }

      if (url === AUTH_ME_PATH) {
        return principalEnvelope
      }

      if (
        url === ADMIN_USERS_PATH &&
        authorization === `${AUTH_BEARER_TOKEN_TYPE} new-access`
      ) {
        return { header: successHeader, data: { ok: true } }
      }

      throw new Error(`Unexpected request: ${url}`)
    })

    vi.stubGlobal('$fetch', fetchMock)

    const authStore = useAuthStore()
    authStore.applyTokenIssue(tokenEnvelope('old-access', 'old-refresh').data)

    const api = useAuthenticatedApi()

    await expect(
      Promise.all([api.get(ADMIN_USERS_PATH), api.get(ADMIN_USERS_PATH)]),
    ).resolves.toEqual([
      { header: successHeader, data: { ok: true } },
      { header: successHeader, data: { ok: true } },
    ])

    const refreshCalls = fetchMock.mock.calls.filter(
      ([url]) => url === AUTH_BROWSER_REFRESH_PATH,
    )

    expect(refreshCalls).toHaveLength(1)
    expect(authStore.accessToken).toBe('new-access')
  })

  it('maps terminal auth faults to session statuses', () => {
    const authStore = useAuthStore()
    authStore.applyTokenIssue(
      tokenEnvelope('status-access', 'status-refresh').data,
    )

    authStore.consumeApiError({
      statusCode: 429,
      statusMessage: 'Too Many Requests',
      message: '请求过于频繁。',
      errorCode: AuthErrorCode.RequestThrottled,
    })
    expect(authStore.status).toBe(AuthSessionStatus.Throttled)

    authStore.applyTokenIssue(
      tokenEnvelope('disabled-access', 'disabled-refresh').data,
    )
    authStore.consumeApiError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: '账号已禁用。',
      errorCode: AuthErrorCode.AccountDisabled,
    })
    expect(authStore.status).toBe(AuthSessionStatus.Disabled)
    expect(authStore.accessToken).toBe('')

    authStore.applyTokenIssue(
      tokenEnvelope('revoked-access', 'revoked-refresh').data,
    )
    authStore.consumeApiError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: '令牌已吊销。',
      errorCode: AuthErrorCode.TokenRevoked,
    })
    expect(authStore.status).toBe(AuthSessionStatus.Revoked)

    authStore.applyTokenIssue(
      tokenEnvelope('reused-access', 'reused-refresh').data,
    )
    authStore.consumeApiError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: '令牌已复用。',
      errorCode: AuthErrorCode.TokenReused,
    })
    expect(authStore.status).toBe(AuthSessionStatus.Reused)

    authStore.applyTokenIssue(
      tokenEnvelope('invalid-access', 'invalid-refresh').data,
    )
    authStore.consumeApiError(
      {
        statusCode: 401,
        statusMessage: 'Unauthorized',
        message: '令牌无效。',
        errorCode: AuthErrorCode.TokenInvalid,
      },
      true,
    )
    expect(authStore.status).toBe(AuthSessionStatus.Anonymous)
  })

  it('keeps an authenticated session when a resource denies an optional capability', () => {
    const authStore = useAuthStore()
    authStore.applyTokenIssue(tokenEnvelope('permission-access').data)
    authStore.principal = {
      kind: 'authenticated_principal',
      subject_id: 'subject-registered',
      username: 'nuo',
      roles: [AuthRole.RegisteredUser],
      scopes: [AuthScope.CodexRead, AuthScope.CodexHostManage],
      is_admin: false,
    }

    authStore.consumeApiError({
      statusCode: 403,
      statusMessage: 'Forbidden',
      message: '当前账号没有审批权限。',
      errorCode: AuthErrorCode.PermissionDenied,
    })

    expect(authStore.status).toBe(AuthSessionStatus.Authenticated)
    expect(authStore.accessToken).toBe('permission-access')
    expect(authStore.principal?.username).toBe('nuo')
  })

  it('clears local session even when revoke fails', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === AUTH_BROWSER_REVOKE_PATH) {
        throw new Error('revoke failed')
      }

      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('$fetch', fetchMock)

    const authStore = useAuthStore()
    authStore.applyTokenIssue(
      tokenEnvelope('logout-access', 'logout-refresh').data,
    )

    await authStore.logout()

    expect(authStore.status).toBe(AuthSessionStatus.Anonymous)
    expect(authStore.accessToken).toBe('')
    expect('refreshToken' in authStore).toBe(false)
    expect(fetchMock).toHaveBeenCalledWith(
      AUTH_BROWSER_REVOKE_PATH,
      expect.objectContaining({
        body: undefined,
        credentials: 'include',
      }),
    )
  })
})
