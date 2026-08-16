import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  unwrapAdminEnvelope,
  unwrapResponseEnvelope,
} from '~/services/api/envelope'
import {
  API_AUTHORIZATION_HEADER_NAME,
  ApiContractErrorCode,
  HttpFaultKind,
  ResponseEnvelopeCode,
} from '~/types/api'
import {
  AdminAuditOperationName,
  AdminAuditPayloadKind,
  ADMIN_AUDIT_SCHEMA_VERSION,
} from '~/types/admin-audit'
import {
  ADMIN_IDENTITY_GRANT_CONFIRMATION_PHRASE,
  ADMIN_IDENTITY_SCHEMA_VERSION,
  AdminIdentityOperationName,
  AdminIdentityPayloadKind,
} from '~/types/admin-identity'
import {
  ADMIN_LOG_SCHEMA_VERSION,
  ADMIN_TASK_SCHEMA_VERSION,
  AdminLogOperationName,
  AdminLogPayloadKind,
  AdminTaskOperationName,
  AdminTaskPayloadKind,
  LogLevel,
  SecurityEventDecision,
  SecurityEventSeverity,
} from '~/types/admin-ops'
import { SecurityProtectionPayloadKind } from '~/types/security-protection'
import {
  AUTH_BEARER_TOKEN_TYPE,
  AuthErrorCode,
  AuthRole,
  AuthScope,
  type TokenIssuePayload,
} from '~/types/auth'

const successHeader = {
  code: ResponseEnvelopeCode.Success,
  message: 'ok',
  request_id: 'request-1',
}

const ADMIN_SCHEMA_VERSION = '1.0'
const UNEXPECTED_KIND = 'unexpected_kind'
const UNEXPECTED_SCHEMA_VERSION = '2.0'
const TASK_PAYLOAD_JSON = '{"task":"sync"}'
const FAULT_REQUEST_ID = 'request-fault'
const FAULT_TRACE_ID = 'trace-fault'
const SECURITY_EVENT_PAYLOAD = {
  event_id: 'security-event-1',
  log_level: LogLevel.Warning,
  log_message: 'auth failure recorded',
  occurred_at: '2026-07-05T00:00:00.000Z',
  request_id: 'request-security',
  trace_id: 'trace-security',
  source_module: 'security',
  source_component: 'auth_guard',
  security_event: {
    header: {
      kind: 'security_event_header',
      schema_version: ADMIN_SCHEMA_VERSION,
      event_type: 'auth.login.failure',
      detail_kind: 'auth_failure_security_event',
      severity: SecurityEventSeverity.Warning,
      decision: SecurityEventDecision.Deny,
      reason_code: 'auth.login.failure',
      request_id: 'request-security',
      trace_id: 'trace-security',
      path: '/auth/token',
      method: 'POST',
      status_code: 401,
      subject_id: null,
      ip_digest: 'ip-digest',
      user_agent_digest: null,
      policy_name: 'auth_failure_guard',
      occurred_at_epoch: 1783209600,
    },
    detail: {
      kind: 'auth_failure_security_event',
      schema_version: ADMIN_SCHEMA_VERSION,
      subject_digest: null,
      ip_digest: 'ip-digest',
      reason_code: 'invalid_credentials',
    },
  },
}

const tokenPayload: TokenIssuePayload = {
  kind: 'token_issue',
  access_token: 'admin-access',
  refresh_token: 'admin-refresh',
  token_type: AUTH_BEARER_TOKEN_TYPE,
  expires_in_seconds: 900,
  refresh_expires_in_seconds: 86400,
}

const adminDetailEnvelope = (
  detail: unknown,
  kind: string,
  operationName: string,
  schemaVersion = ADMIN_SCHEMA_VERSION,
) => ({
  header: successHeader,
  data: {
    header: {
      kind,
      schema_version: schemaVersion,
      operation_name: operationName,
    },
    detail,
  },
})

const applyAdminSession = () => {
  const authStore = useAuthStore()
  authStore.applyTokenIssue(tokenPayload)
  authStore.principal = {
    kind: 'authenticated_principal',
    subject_id: 'subject-1',
    username: 'admin',
    roles: [AuthRole.Admin],
    scopes: [
      AuthScope.AuthRead,
      AuthScope.AuthManage,
      AuthScope.SystemRead,
      AuthScope.TaskDispatch,
      AuthScope.SecurityManage,
    ],
    is_admin: true,
  }
}

describe('admin API clients', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useAuthStore().$reset()
  })

  it('wraps task dispatch with header/detail and preserves payload_json', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        adminDetailEnvelope(
          { accepted: true },
          AdminTaskPayloadKind.DispatchResult,
          AdminTaskOperationName.DispatchResult,
        ),
      )
    vi.stubGlobal('$fetch', fetchMock)
    applyAdminSession()

    await expect(
      createAdminOpsClient().tasks.dispatch({
        job_kind: 'sync',
        payload_json: TASK_PAYLOAD_JSON,
      }),
    ).resolves.toEqual({ accepted: true })

    const [, options] = fetchMock.mock.calls[0] ?? []

    expect(options.body).toEqual({
      header: {
        kind: AdminTaskPayloadKind.Dispatch,
        schema_version: ADMIN_TASK_SCHEMA_VERSION,
        operation_name: AdminTaskOperationName.Dispatch,
      },
      detail: {
        kind: AdminTaskPayloadKind.Dispatch,
        schema_version: ADMIN_TASK_SCHEMA_VERSION,
        job_kind: 'sync',
        payload_json: TASK_PAYLOAD_JSON,
        retry_limit: 0,
        deduplication_key: null,
      },
    })
    expect(
      (options.headers as Headers).get(API_AUTHORIZATION_HEADER_NAME),
    ).toBe(`${AUTH_BEARER_TOKEN_TYPE} admin-access`)
  })

  it('rejects admin envelopes with invalid header contracts', () => {
    expect(() => {
      try {
        unwrapAdminEnvelope(
          adminDetailEnvelope(
            [],
            AdminIdentityPayloadKind.UserList,
            AdminIdentityOperationName.UserList,
          ),
          {
            expectedKind: AdminIdentityPayloadKind.User,
            expectedOperationName: AdminIdentityOperationName.UserList,
          },
        )
      } catch (error) {
        expect(error).toMatchObject({
          errorCode: ApiContractErrorCode.AdminEnvelopeInvalid,
          message: expect.stringContaining('kind'),
        })
        throw error
      }
    }).toThrow()
  })

  it('rejects resolved fault envelopes with a stable API error payload', () => {
    try {
      unwrapResponseEnvelope({
        header: {
          code: AuthErrorCode.PermissionDenied,
          message: '权限不足。',
          request_id: FAULT_REQUEST_ID,
          trace_id: FAULT_TRACE_ID,
        },
        data: {
          kind: HttpFaultKind.HttpFault,
          schema_version: ADMIN_SCHEMA_VERSION,
          status_code: 403,
          error_code: AuthErrorCode.PermissionDenied,
        },
      })
    } catch (error) {
      expect(error).toMatchObject({
        statusCode: 403,
        statusMessage: '权限不足。',
        message: '权限不足。',
        code: AuthErrorCode.PermissionDenied,
        errorCode: AuthErrorCode.PermissionDenied,
        requestId: FAULT_REQUEST_ID,
        traceId: FAULT_TRACE_ID,
        kind: HttpFaultKind.HttpFault,
      })

      return
    }

    throw new Error('fault envelope 应当被统一错误模型拒绝。')
  })

  it('rejects mismatched operation names through module clients', async () => {
    vi.stubGlobal(
      '$fetch',
      vi
        .fn()
        .mockResolvedValue(
          adminDetailEnvelope(
            { accepted: true },
            AdminTaskPayloadKind.DispatchResult,
            AdminTaskOperationName.ExecutionList,
          ),
        ),
    )
    applyAdminSession()

    await expect(
      createAdminOpsClient().tasks.dispatch({
        job_kind: 'sync',
        payload_json: TASK_PAYLOAD_JSON,
      }),
    ).rejects.toMatchObject({
      errorCode: ApiContractErrorCode.AdminEnvelopeInvalid,
      message: expect.stringContaining('operation_name'),
    })
  })

  it('rejects missing and mismatched admin headers through module clients', async () => {
    const invalidEnvelopes = [
      {
        envelope: {
          header: successHeader,
          data: {
            header: {
              kind: AdminTaskPayloadKind.DispatchResult,
              operation_name: AdminTaskOperationName.DispatchResult,
            },
            detail: { accepted: true },
          },
        },
        message: 'schema_version',
      },
      {
        envelope: adminDetailEnvelope(
          { accepted: true },
          UNEXPECTED_KIND,
          AdminTaskOperationName.DispatchResult,
        ),
        message: 'kind',
      },
      {
        envelope: adminDetailEnvelope(
          { accepted: true },
          AdminTaskPayloadKind.DispatchResult,
          AdminTaskOperationName.DispatchResult,
          UNEXPECTED_SCHEMA_VERSION,
        ),
        message: 'schema_version',
      },
      {
        envelope: {
          header: successHeader,
          data: {
            header: {
              kind: AdminTaskPayloadKind.DispatchResult,
              schema_version: ADMIN_SCHEMA_VERSION,
              operation_name: AdminTaskOperationName.DispatchResult,
            },
          },
        },
        message: 'detail',
      },
    ]

    applyAdminSession()

    for (const { envelope, message } of invalidEnvelopes) {
      vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(envelope))

      await expect(
        createAdminOpsClient().tasks.dispatch({
          job_kind: 'sync',
          payload_json: TASK_PAYLOAD_JSON,
        }),
      ).rejects.toMatchObject({
        errorCode: ApiContractErrorCode.AdminEnvelopeInvalid,
        message: expect.stringContaining(message),
      })
    }
  })

  it('applies operation contracts across identity and audit module clients', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        adminDetailEnvelope(
          {
            users: [],
            page_size: 20,
            offset: 0,
            total: 0,
          },
          AdminIdentityPayloadKind.UserList,
          AdminIdentityOperationName.UserList,
          ADMIN_IDENTITY_SCHEMA_VERSION,
        ),
      )
      .mockResolvedValueOnce(
        adminDetailEnvelope(
          {
            events: [],
            page_size: 20,
            offset: 0,
            total: 0,
          },
          AdminAuditPayloadKind.EventList,
          AdminAuditOperationName.EventList,
          ADMIN_AUDIT_SCHEMA_VERSION,
        ),
      )
    vi.stubGlobal('$fetch', fetchMock)
    applyAdminSession()

    await expect(createAdminIdentityClient().users.list()).resolves.toEqual({
      users: [],
      page_size: 20,
      offset: 0,
      total: 0,
    })
    await expect(createAdminAuditClient().list()).resolves.toEqual({
      events: [],
      page_size: 20,
      offset: 0,
      total: 0,
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/admin/users')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/admin/audit-events')
  })

  it('uses backend role_list operation for the business role list', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      adminDetailEnvelope(
        {
          roles: [],
          page_size: 20,
          offset: 0,
          total: 0,
        },
        AdminIdentityPayloadKind.BusinessRoleList,
        AdminIdentityOperationName.RoleList,
        ADMIN_IDENTITY_SCHEMA_VERSION,
      ),
    )
    vi.stubGlobal('$fetch', fetchMock)
    applyAdminSession()

    await expect(
      createAdminIdentityClient().businessRoles.list(),
    ).resolves.toEqual({
      roles: [],
      page_size: 20,
      offset: 0,
      total: 0,
    })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/admin/business-roles')
  })

  it('keeps security events on the canonical events field', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      adminDetailEnvelope(
        {
          kind: AdminLogPayloadKind.SecurityEventList,
          schema_version: ADMIN_LOG_SCHEMA_VERSION,
          events: [SECURITY_EVENT_PAYLOAD],
        },
        AdminLogPayloadKind.SecurityEventList,
        AdminLogOperationName.SecurityEventList,
        ADMIN_LOG_SCHEMA_VERSION,
      ),
    )
    vi.stubGlobal('$fetch', fetchMock)
    applyAdminSession()

    await expect(createAdminOpsClient().logs.securityEvents()).resolves.toEqual(
      {
        kind: AdminLogPayloadKind.SecurityEventList,
        schema_version: ADMIN_LOG_SCHEMA_VERSION,
        events: [SECURITY_EVENT_PAYLOAD],
      },
    )
  })

  it('uses backend POST method and confirmation for user role replacement', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        adminDetailEnvelope(
          { subject_id: 'subject-1' },
          AdminIdentityPayloadKind.User,
          AdminIdentityOperationName.UserRoleReplace,
        ),
      )
    vi.stubGlobal('$fetch', fetchMock)
    applyAdminSession()

    await createAdminIdentityClient().users.replaceRoles('subject-1', {
      role_keys: ['admin'],
      confirmation: ADMIN_IDENTITY_GRANT_CONFIRMATION_PHRASE,
    })

    const [, options] = fetchMock.mock.calls[0] ?? []

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/admin/users/subject-1/roles')
    expect(options.method).toBe('POST')
    expect(options.body.detail.role_keys).toEqual(['admin'])
    expect(options.body.detail.confirmation).toBe(
      ADMIN_IDENTITY_GRANT_CONFIRMATION_PHRASE,
    )
  })

  it('uses backend PUT method and confirmation for user scope replacement', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        adminDetailEnvelope(
          { subject_id: 'subject-1' },
          AdminIdentityPayloadKind.User,
          AdminIdentityOperationName.UserScopeReplace,
        ),
      )
    vi.stubGlobal('$fetch', fetchMock)
    applyAdminSession()

    await createAdminIdentityClient().users.replaceScopes('subject-1', {
      scope_codes: ['codex:read', 'codex:operate'],
      confirmation: ADMIN_IDENTITY_GRANT_CONFIRMATION_PHRASE,
    })

    const [, options] = fetchMock.mock.calls[0] ?? []

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/admin/users/subject-1/scopes')
    expect(options.method).toBe('PUT')
    expect(options.body.detail.scope_codes).toEqual([
      'codex:read',
      'codex:operate',
    ])
    expect(options.body.detail.confirmation).toBe(
      ADMIN_IDENTITY_GRANT_CONFIRMATION_PHRASE,
    )
  })

  it('keeps security protection on plain response envelopes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      header: successHeader,
      data: {
        kind: SecurityProtectionPayloadKind.IpBlockList,
        schema_version: ADMIN_SCHEMA_VERSION,
        records: [],
      },
    })
    vi.stubGlobal('$fetch', fetchMock)
    applyAdminSession()

    await expect(createAdminSecurityClient().ipBlocks.list()).resolves.toEqual({
      kind: SecurityProtectionPayloadKind.IpBlockList,
      schema_version: ADMIN_SCHEMA_VERSION,
      records: [],
    })
  })
})
