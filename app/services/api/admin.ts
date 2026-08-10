import type {
  AdminAuditEventListPayload,
  AdminAuditQuery,
} from '~/types/admin-audit'
import {
  ADMIN_AUDIT_SCHEMA_VERSION,
  ADMIN_AUDIT_DEFAULT_OFFSET,
  ADMIN_AUDIT_DEFAULT_PAGE_SIZE,
  AdminAuditOperationName,
  AdminAuditPayloadKind,
} from '~/types/admin-audit'
import type {
  AdminBusinessRoleListPayload,
  AdminIdentityEnvelope,
  AdminRoleListPayload,
  AdminRoleMutateDetail,
  AdminRolePayload,
  AdminRoleScopeReplaceDetail,
  AdminScopeListPayload,
  AdminScopeMutateDetail,
  AdminScopePayload,
  AdminUserCreateDetail,
  AdminUserListPayload,
  AdminUserPasswordResetDetail,
  AdminUserPayload,
  AdminUserRoleReplaceDetail,
  AdminUserStatusDetail,
  AdminUserStatusResultPayload,
  AdminUserUpdateDetail,
} from '~/types/admin-identity'
import {
  ADMIN_IDENTITY_DEFAULT_LIMIT,
  ADMIN_IDENTITY_DEFAULT_OFFSET,
  ADMIN_IDENTITY_DEFAULT_PAGE_SIZE,
  ADMIN_IDENTITY_SCHEMA_VERSION,
  AdminIdentityOperationName,
  AdminIdentityPayloadKind,
} from '~/types/admin-identity'
import type {
  AdminLogQuery,
  AdminLogRecordListPayload,
  AdminSecurityEventListPayload,
  AdminSecurityEventQuery,
  AdminSettingsReloadCandidatePayload,
  AdminSettingsReloadRequestDetail,
  AdminSettingsReloadResultPayload,
  AdminTaskDispatchDetail,
  AdminTaskDispatchResultPayload,
  AdminTaskExecutionListPayload,
  AdminTaskExecutionRecordPayload,
  AdminTaskQuery,
  AdminTaskRegistrationListPayload,
  AdminTaskRuntimePayload,
  HealthProbePayload,
  SystemOverviewAdminPayload,
} from '~/types/admin-ops'
import {
  ADMIN_LOG_SCHEMA_VERSION,
  ADMIN_OPS_DEFAULT_LIMIT,
  ADMIN_SETTINGS_RELOAD_SCHEMA_VERSION,
  ADMIN_TASK_SCHEMA_VERSION,
  AdminLogOperationName,
  AdminLogPayloadKind,
  AdminSettingsReloadKind,
  AdminSettingsReloadOperationName,
  AdminTaskOperationName,
  AdminTaskPayloadKind,
} from '~/types/admin-ops'
import type {
  SecurityIpBlockCreatePayload,
  SecurityIpBlockCreateRequest,
  SecurityIpBlockListPayload,
  SecurityIpBlockQuery,
  SecurityIpBlockRecordPayload,
  SecurityIpBlockReleasePayload,
  SecurityIpBlockReleaseRequest,
} from '~/types/security-protection'
import {
  SECURITY_PROTECTION_DEFAULT_LIMIT,
  SECURITY_PROTECTION_SCHEMA_VERSION,
  SecurityIpBlockReason,
  SecurityProtectionPayloadKind,
} from '~/types/security-protection'
import type {
  AdminEnvelope,
  AdminEnvelopeValidationOptions,
  ApiRequestBody,
  ApiRequestOptions,
  ApiResponseEnvelope,
} from '~/types/api'
import { unwrapAdminEnvelope, unwrapResponseEnvelope } from './envelope'

type QueryValue = string | number | boolean | null | undefined
type QueryParams = Record<string, QueryValue>

const ADMIN_SCOPES_PATH = '/admin/scopes'
const ADMIN_ROLES_PATH = '/admin/roles'
const ADMIN_BUSINESS_ROLES_PATH = '/admin/business-roles'
const ADMIN_USERS_PATH = '/admin/users'
const ADMIN_AUDIT_EVENTS_PATH = '/admin/audit-events'
const ADMIN_TASK_EXECUTIONS_PATH = '/admin/tasks/executions'
const ADMIN_TASK_RUNTIME_PATH = '/admin/tasks/runtime'
const ADMIN_TASK_REGISTRATIONS_PATH = '/admin/tasks/registrations'
const ADMIN_TASK_DISPATCH_PATH = '/admin/tasks/dispatch'
const ADMIN_SETTINGS_RELOAD_CANDIDATE_PATH = '/admin/settings/reload/candidate'
const ADMIN_SETTINGS_RELOAD_PATH = '/admin/settings/reload'
const ADMIN_LOG_RECORDS_PATH = '/admin/logs'
const ADMIN_SECURITY_EVENTS_PATH = '/admin/security-events'
const SECURITY_IP_BLOCKS_PATH = '/security/ip-blocks'
const SECURITY_IP_BLOCK_RELEASE_PATH = '/security/ip-blocks/release'
const SYSTEM_INFO_PATH = '/system/info'
const HEALTH_LIVE_PATH = '/health/live'
const HEALTH_READY_PATH = '/health/ready'

const EMPTY_QUERY_VALUE = ''
const DEFAULT_RETRY_LIMIT = 0

const withoutEmptyQuery = (query?: QueryParams) => {
  if (!query) {
    return undefined
  }

  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => {
      return (
        value !== undefined && value !== null && value !== EMPTY_QUERY_VALUE
      )
    }),
  )
}

const createAdminEnvelopeClient = () => {
  const api = useAuthenticatedApi()

  const request = async <T>(
    url: string,
    options: ApiRequestOptions = {},
  ): Promise<T> => {
    const envelope = await api.request<ApiResponseEnvelope<T>>(url, options)

    return unwrapResponseEnvelope(envelope)
  }

  const requestDetail = async <T>(
    url: string,
    options: ApiRequestOptions = {},
    validationOptions: AdminEnvelopeValidationOptions,
  ): Promise<T> => {
    const envelope = await api.request<ApiResponseEnvelope<AdminEnvelope<T>>>(
      url,
      options,
    )

    return unwrapAdminEnvelope<T>(envelope, validationOptions)
  }

  return {
    request,
    getDetail: <T>(
      url: string,
      query: QueryParams | undefined,
      validationOptions: AdminEnvelopeValidationOptions,
    ) =>
      requestDetail<T>(
        url,
        {
          method: 'GET',
          query: withoutEmptyQuery(query),
        },
        validationOptions,
      ),
    command: <T>(
      url: string,
      validationOptions: AdminEnvelopeValidationOptions,
      body?: ApiRequestBody,
      options?: ApiRequestOptions,
    ) =>
      requestDetail<T>(
        url,
        {
          ...options,
          method: options?.method ?? 'POST',
          body,
        },
        validationOptions,
      ),
  }
}

const buildIdentityEnvelope = <TDetail>(
  kind: AdminIdentityPayloadKind,
  operationName: AdminIdentityOperationName,
  detail: TDetail,
): AdminIdentityEnvelope<TDetail> => ({
  header: {
    kind,
    schema_version: ADMIN_IDENTITY_SCHEMA_VERSION,
    operation_name: operationName,
  },
  detail,
})

const scopePath = (scopeCode: string) =>
  `${ADMIN_SCOPES_PATH}/${encodeURIComponent(scopeCode)}`

const rolePath = (roleKey: string) =>
  `${ADMIN_ROLES_PATH}/${encodeURIComponent(roleKey)}`

const roleScopesPath = (roleKey: string) => `${rolePath(roleKey)}/scopes`

const userPath = (subjectId: string) =>
  `${ADMIN_USERS_PATH}/${encodeURIComponent(subjectId)}`

const userPasswordPath = (subjectId: string) =>
  `${userPath(subjectId)}/password`

const userRolesPath = (subjectId: string) => `${userPath(subjectId)}/roles`

const userDisablePath = (subjectId: string) => `${userPath(subjectId)}/disable`

const userEnablePath = (subjectId: string) => `${userPath(subjectId)}/enable`

export const createAdminIdentityClient = () => {
  const client = createAdminEnvelopeClient()

  return {
    scopes: {
      list: (query?: QueryParams) =>
        client.getDetail<AdminScopeListPayload>(
          ADMIN_SCOPES_PATH,
          {
            limit: ADMIN_IDENTITY_DEFAULT_LIMIT,
            ...query,
          },
          {
            expectedKind: AdminIdentityPayloadKind.ScopeList,
            expectedOperationName: AdminIdentityOperationName.ScopeList,
            expectedSchemaVersion: ADMIN_IDENTITY_SCHEMA_VERSION,
          },
        ),
      detail: (scopeCode: string) =>
        client.getDetail<AdminScopePayload>(scopePath(scopeCode), undefined, {
          expectedKind: AdminIdentityPayloadKind.Scope,
          expectedOperationName: AdminIdentityOperationName.ScopeDetail,
          expectedSchemaVersion: ADMIN_IDENTITY_SCHEMA_VERSION,
        }),
      create: (
        detail: Omit<AdminScopeMutateDetail, 'kind' | 'schema_version'>,
      ) =>
        client.command<AdminScopePayload>(
          ADMIN_SCOPES_PATH,
          {
            expectedKind: AdminIdentityPayloadKind.Scope,
            expectedOperationName: AdminIdentityOperationName.ScopeCreate,
            expectedSchemaVersion: ADMIN_IDENTITY_SCHEMA_VERSION,
          },
          buildIdentityEnvelope(
            AdminIdentityPayloadKind.ScopeCreate,
            AdminIdentityOperationName.ScopeCreate,
            {
              ...detail,
              kind: AdminIdentityPayloadKind.ScopeCreate,
              schema_version: ADMIN_IDENTITY_SCHEMA_VERSION,
            },
          ),
        ),
      update: (
        scopeCode: string,
        detail: Omit<AdminScopeMutateDetail, 'kind' | 'schema_version'>,
      ) =>
        client.command<AdminScopePayload>(
          scopePath(scopeCode),
          {
            expectedKind: AdminIdentityPayloadKind.Scope,
            expectedOperationName: AdminIdentityOperationName.ScopeUpdate,
            expectedSchemaVersion: ADMIN_IDENTITY_SCHEMA_VERSION,
          },
          buildIdentityEnvelope(
            AdminIdentityPayloadKind.ScopeUpdate,
            AdminIdentityOperationName.ScopeUpdate,
            {
              ...detail,
              kind: AdminIdentityPayloadKind.ScopeUpdate,
              schema_version: ADMIN_IDENTITY_SCHEMA_VERSION,
            },
          ),
          { method: 'PATCH' },
        ),
      delete: (scopeCode: string) =>
        client.command(
          scopePath(scopeCode),
          {
            expectedKind: AdminIdentityPayloadKind.ScopeDeleteResult,
            expectedOperationName: AdminIdentityOperationName.ScopeDelete,
            expectedSchemaVersion: ADMIN_IDENTITY_SCHEMA_VERSION,
          },
          undefined,
          { method: 'DELETE' },
        ),
    },
    roles: {
      list: (query?: QueryParams) =>
        client.getDetail<AdminRoleListPayload>(
          ADMIN_ROLES_PATH,
          {
            page_size: ADMIN_IDENTITY_DEFAULT_PAGE_SIZE,
            offset: ADMIN_IDENTITY_DEFAULT_OFFSET,
            ...query,
          },
          {
            expectedKind: AdminIdentityPayloadKind.RoleList,
            expectedOperationName: AdminIdentityOperationName.RoleList,
            expectedSchemaVersion: ADMIN_IDENTITY_SCHEMA_VERSION,
          },
        ),
      detail: (roleKey: string) =>
        client.getDetail<AdminRolePayload>(rolePath(roleKey), undefined, {
          expectedKind: AdminIdentityPayloadKind.Role,
          expectedOperationName: AdminIdentityOperationName.RoleDetail,
          expectedSchemaVersion: ADMIN_IDENTITY_SCHEMA_VERSION,
        }),
      create: (
        detail: Omit<AdminRoleMutateDetail, 'kind' | 'schema_version'>,
      ) =>
        client.command<AdminRolePayload>(
          ADMIN_ROLES_PATH,
          {
            expectedKind: AdminIdentityPayloadKind.Role,
            expectedOperationName: AdminIdentityOperationName.RoleCreate,
            expectedSchemaVersion: ADMIN_IDENTITY_SCHEMA_VERSION,
          },
          buildIdentityEnvelope(
            AdminIdentityPayloadKind.RoleCreate,
            AdminIdentityOperationName.RoleCreate,
            {
              ...detail,
              kind: AdminIdentityPayloadKind.RoleCreate,
              schema_version: ADMIN_IDENTITY_SCHEMA_VERSION,
            },
          ),
        ),
      update: (
        roleKey: string,
        detail: Omit<AdminRoleMutateDetail, 'kind' | 'schema_version'>,
      ) =>
        client.command<AdminRolePayload>(
          rolePath(roleKey),
          {
            expectedKind: AdminIdentityPayloadKind.Role,
            expectedOperationName: AdminIdentityOperationName.RoleUpdate,
            expectedSchemaVersion: ADMIN_IDENTITY_SCHEMA_VERSION,
          },
          buildIdentityEnvelope(
            AdminIdentityPayloadKind.RoleUpdate,
            AdminIdentityOperationName.RoleUpdate,
            {
              ...detail,
              kind: AdminIdentityPayloadKind.RoleUpdate,
              schema_version: ADMIN_IDENTITY_SCHEMA_VERSION,
            },
          ),
          { method: 'PATCH' },
        ),
      replaceScopes: (
        roleKey: string,
        detail: Omit<AdminRoleScopeReplaceDetail, 'kind' | 'schema_version'>,
      ) =>
        client.command<AdminRolePayload>(
          roleScopesPath(roleKey),
          {
            expectedKind: AdminIdentityPayloadKind.Role,
            expectedOperationName: AdminIdentityOperationName.RoleScopeReplace,
            expectedSchemaVersion: ADMIN_IDENTITY_SCHEMA_VERSION,
          },
          buildIdentityEnvelope(
            AdminIdentityPayloadKind.RoleScopeReplace,
            AdminIdentityOperationName.RoleScopeReplace,
            {
              ...detail,
              kind: AdminIdentityPayloadKind.RoleScopeReplace,
              schema_version: ADMIN_IDENTITY_SCHEMA_VERSION,
            },
          ),
          { method: 'PUT' },
        ),
      delete: (roleKey: string) =>
        client.command(
          rolePath(roleKey),
          {
            expectedKind: AdminIdentityPayloadKind.RoleDeleteResult,
            expectedOperationName: AdminIdentityOperationName.RoleDelete,
            expectedSchemaVersion: ADMIN_IDENTITY_SCHEMA_VERSION,
          },
          undefined,
          { method: 'DELETE' },
        ),
    },
    businessRoles: {
      list: (query?: QueryParams) =>
        client.getDetail<AdminBusinessRoleListPayload>(
          ADMIN_BUSINESS_ROLES_PATH,
          {
            page_size: ADMIN_IDENTITY_DEFAULT_PAGE_SIZE,
            offset: ADMIN_IDENTITY_DEFAULT_OFFSET,
            ...query,
          },
          {
            expectedKind: AdminIdentityPayloadKind.BusinessRoleList,
            // 后端业务角色列表复用 role_list 操作名(见 route_admin_role.py)。
            expectedOperationName: AdminIdentityOperationName.RoleList,
            expectedSchemaVersion: ADMIN_IDENTITY_SCHEMA_VERSION,
          },
        ),
    },
    users: {
      list: (query?: QueryParams) =>
        client.getDetail<AdminUserListPayload>(
          ADMIN_USERS_PATH,
          {
            page_size: ADMIN_IDENTITY_DEFAULT_PAGE_SIZE,
            offset: ADMIN_IDENTITY_DEFAULT_OFFSET,
            ...query,
          },
          {
            expectedKind: AdminIdentityPayloadKind.UserList,
            expectedOperationName: AdminIdentityOperationName.UserList,
            expectedSchemaVersion: ADMIN_IDENTITY_SCHEMA_VERSION,
          },
        ),
      detail: (subjectId: string) =>
        client.getDetail<AdminUserPayload>(userPath(subjectId), undefined, {
          expectedKind: AdminIdentityPayloadKind.User,
          expectedOperationName: AdminIdentityOperationName.UserDetail,
          expectedSchemaVersion: ADMIN_IDENTITY_SCHEMA_VERSION,
        }),
      create: (
        detail: Omit<AdminUserCreateDetail, 'kind' | 'schema_version'>,
      ) =>
        client.command<AdminUserPayload>(
          ADMIN_USERS_PATH,
          {
            expectedKind: AdminIdentityPayloadKind.User,
            expectedOperationName: AdminIdentityOperationName.UserCreate,
            expectedSchemaVersion: ADMIN_IDENTITY_SCHEMA_VERSION,
          },
          buildIdentityEnvelope(
            AdminIdentityPayloadKind.UserCreate,
            AdminIdentityOperationName.UserCreate,
            {
              ...detail,
              kind: AdminIdentityPayloadKind.UserCreate,
              schema_version: ADMIN_IDENTITY_SCHEMA_VERSION,
            },
          ),
        ),
      update: (
        subjectId: string,
        detail: Omit<AdminUserUpdateDetail, 'kind' | 'schema_version'>,
      ) =>
        client.command<AdminUserPayload>(
          userPath(subjectId),
          {
            expectedKind: AdminIdentityPayloadKind.User,
            expectedOperationName: AdminIdentityOperationName.UserUpdate,
            expectedSchemaVersion: ADMIN_IDENTITY_SCHEMA_VERSION,
          },
          buildIdentityEnvelope(
            AdminIdentityPayloadKind.UserUpdate,
            AdminIdentityOperationName.UserUpdate,
            {
              ...detail,
              kind: AdminIdentityPayloadKind.UserUpdate,
              schema_version: ADMIN_IDENTITY_SCHEMA_VERSION,
            },
          ),
          { method: 'PATCH' },
        ),
      resetPassword: (
        subjectId: string,
        detail: Omit<AdminUserPasswordResetDetail, 'kind' | 'schema_version'>,
      ) =>
        client.command<AdminUserPayload>(
          userPasswordPath(subjectId),
          {
            expectedKind: AdminIdentityPayloadKind.User,
            expectedOperationName: AdminIdentityOperationName.UserPasswordReset,
            expectedSchemaVersion: ADMIN_IDENTITY_SCHEMA_VERSION,
          },
          buildIdentityEnvelope(
            AdminIdentityPayloadKind.UserPasswordReset,
            AdminIdentityOperationName.UserPasswordReset,
            {
              ...detail,
              kind: AdminIdentityPayloadKind.UserPasswordReset,
              schema_version: ADMIN_IDENTITY_SCHEMA_VERSION,
            },
          ),
        ),
      replaceRoles: (
        subjectId: string,
        detail: Omit<AdminUserRoleReplaceDetail, 'kind' | 'schema_version'>,
      ) =>
        client.command<AdminUserPayload>(
          userRolesPath(subjectId),
          {
            expectedKind: AdminIdentityPayloadKind.User,
            expectedOperationName: AdminIdentityOperationName.UserRoleReplace,
            expectedSchemaVersion: ADMIN_IDENTITY_SCHEMA_VERSION,
          },
          buildIdentityEnvelope(
            AdminIdentityPayloadKind.UserRoleReplace,
            AdminIdentityOperationName.UserRoleReplace,
            {
              ...detail,
              kind: AdminIdentityPayloadKind.UserRoleReplace,
              schema_version: ADMIN_IDENTITY_SCHEMA_VERSION,
            },
          ),
        ),
      disable: (
        subjectId: string,
        detail: Omit<AdminUserStatusDetail, 'kind' | 'schema_version'>,
      ) =>
        client.command<AdminUserStatusResultPayload>(
          userDisablePath(subjectId),
          {
            expectedKind: AdminIdentityPayloadKind.UserStatusResult,
            expectedOperationName: AdminIdentityOperationName.UserDisable,
            expectedSchemaVersion: ADMIN_IDENTITY_SCHEMA_VERSION,
          },
          buildIdentityEnvelope(
            AdminIdentityPayloadKind.UserDisable,
            AdminIdentityOperationName.UserDisable,
            {
              ...detail,
              kind: AdminIdentityPayloadKind.UserDisable,
              schema_version: ADMIN_IDENTITY_SCHEMA_VERSION,
            },
          ),
        ),
      enable: (
        subjectId: string,
        detail: Omit<AdminUserStatusDetail, 'kind' | 'schema_version'>,
      ) =>
        client.command<AdminUserStatusResultPayload>(
          userEnablePath(subjectId),
          {
            expectedKind: AdminIdentityPayloadKind.UserStatusResult,
            expectedOperationName: AdminIdentityOperationName.UserEnable,
            expectedSchemaVersion: ADMIN_IDENTITY_SCHEMA_VERSION,
          },
          buildIdentityEnvelope(
            AdminIdentityPayloadKind.UserEnable,
            AdminIdentityOperationName.UserEnable,
            {
              ...detail,
              kind: AdminIdentityPayloadKind.UserEnable,
              schema_version: ADMIN_IDENTITY_SCHEMA_VERSION,
            },
          ),
        ),
    },
  }
}

export const createAdminAuditClient = () => {
  const client = createAdminEnvelopeClient()

  return {
    list: (query?: AdminAuditQuery) =>
      client.getDetail<AdminAuditEventListPayload>(
        ADMIN_AUDIT_EVENTS_PATH,
        {
          page_size: ADMIN_AUDIT_DEFAULT_PAGE_SIZE,
          offset: ADMIN_AUDIT_DEFAULT_OFFSET,
          ...query,
        },
        {
          expectedKind: AdminAuditPayloadKind.EventList,
          expectedOperationName: AdminAuditOperationName.EventList,
          expectedSchemaVersion: ADMIN_AUDIT_SCHEMA_VERSION,
        },
      ),
  }
}

export const createAdminSecurityClient = () => {
  const client = createAdminEnvelopeClient()

  return {
    ipBlocks: {
      list: (query?: SecurityIpBlockQuery) =>
        client.request<SecurityIpBlockListPayload>(SECURITY_IP_BLOCKS_PATH, {
          method: 'GET',
          query: withoutEmptyQuery({
            limit: SECURITY_PROTECTION_DEFAULT_LIMIT,
            ...query,
          }),
        }),
      detail: (recordId: string) =>
        client.request<SecurityIpBlockRecordPayload>(
          `${SECURITY_IP_BLOCKS_PATH}/${encodeURIComponent(recordId)}`,
          {
            method: 'GET',
          },
        ),
      create: (
        detail: Omit<
          SecurityIpBlockCreateRequest,
          'kind' | 'schema_version' | 'reason'
        > &
          Partial<Pick<SecurityIpBlockCreateRequest, 'reason'>>,
      ) =>
        client.request<SecurityIpBlockCreatePayload>(SECURITY_IP_BLOCKS_PATH, {
          method: 'POST',
          body: {
            ...detail,
            kind: SecurityProtectionPayloadKind.IpBlockCreate,
            schema_version: SECURITY_PROTECTION_SCHEMA_VERSION,
            reason: detail.reason ?? SecurityIpBlockReason.Manual,
          },
        }),
      release: (
        detail: Omit<SecurityIpBlockReleaseRequest, 'kind' | 'schema_version'>,
      ) =>
        client.request<SecurityIpBlockReleasePayload>(
          SECURITY_IP_BLOCK_RELEASE_PATH,
          {
            method: 'POST',
            body: {
              ...detail,
              kind: SecurityProtectionPayloadKind.IpBlockRelease,
              schema_version: SECURITY_PROTECTION_SCHEMA_VERSION,
            },
          },
        ),
    },
  }
}

export const createAdminOpsClient = () => {
  const client = createAdminEnvelopeClient()
  const securityClient = createAdminSecurityClient()

  return {
    tasks: {
      executions: (query?: AdminTaskQuery) =>
        client.getDetail<AdminTaskExecutionListPayload>(
          ADMIN_TASK_EXECUTIONS_PATH,
          {
            limit: ADMIN_OPS_DEFAULT_LIMIT,
            ...query,
          },
          {
            expectedKind: AdminTaskPayloadKind.ExecutionList,
            expectedOperationName: AdminTaskOperationName.ExecutionList,
            expectedSchemaVersion: ADMIN_TASK_SCHEMA_VERSION,
          },
        ),
      execution: (taskId: string) =>
        client.getDetail<AdminTaskExecutionRecordPayload>(
          `${ADMIN_TASK_EXECUTIONS_PATH}/${encodeURIComponent(taskId)}`,
          undefined,
          {
            expectedKind: AdminTaskPayloadKind.ExecutionRecord,
            expectedOperationName: AdminTaskOperationName.ExecutionRecord,
            expectedSchemaVersion: ADMIN_TASK_SCHEMA_VERSION,
          },
        ),
      runtime: () =>
        client.getDetail<AdminTaskRuntimePayload>(
          ADMIN_TASK_RUNTIME_PATH,
          undefined,
          {
            expectedKind: AdminTaskPayloadKind.Runtime,
            expectedOperationName: AdminTaskOperationName.RuntimeRead,
            expectedSchemaVersion: ADMIN_TASK_SCHEMA_VERSION,
          },
        ),
      registrations: () =>
        client.getDetail<AdminTaskRegistrationListPayload>(
          ADMIN_TASK_REGISTRATIONS_PATH,
          undefined,
          {
            expectedKind: AdminTaskPayloadKind.RegistrationList,
            expectedOperationName: AdminTaskOperationName.RegistrationList,
            expectedSchemaVersion: ADMIN_TASK_SCHEMA_VERSION,
          },
        ),
      dispatch: (
        detail: Omit<AdminTaskDispatchDetail, 'kind' | 'schema_version'>,
      ) =>
        client.command<AdminTaskDispatchResultPayload>(
          ADMIN_TASK_DISPATCH_PATH,
          {
            expectedKind: AdminTaskPayloadKind.DispatchResult,
            expectedOperationName: AdminTaskOperationName.DispatchResult,
            expectedSchemaVersion: ADMIN_TASK_SCHEMA_VERSION,
          },
          {
            header: {
              kind: AdminTaskPayloadKind.Dispatch,
              schema_version: ADMIN_TASK_SCHEMA_VERSION,
              operation_name: AdminTaskOperationName.Dispatch,
            },
            detail: {
              retry_limit: DEFAULT_RETRY_LIMIT,
              deduplication_key: null,
              ...detail,
              kind: AdminTaskPayloadKind.Dispatch,
              schema_version: ADMIN_TASK_SCHEMA_VERSION,
            },
          },
        ),
    },
    settingsReload: {
      candidate: () =>
        client.getDetail<AdminSettingsReloadCandidatePayload>(
          ADMIN_SETTINGS_RELOAD_CANDIDATE_PATH,
          undefined,
          {
            expectedKind: AdminSettingsReloadKind.Candidate,
            expectedOperationName:
              AdminSettingsReloadOperationName.ReadCandidate,
            expectedSchemaVersion: ADMIN_SETTINGS_RELOAD_SCHEMA_VERSION,
          },
        ),
      execute: () =>
        client.command<AdminSettingsReloadResultPayload>(
          ADMIN_SETTINGS_RELOAD_PATH,
          {
            expectedKind: AdminSettingsReloadKind.Result,
            expectedOperationName:
              AdminSettingsReloadOperationName.ReloadResult,
            expectedSchemaVersion: ADMIN_SETTINGS_RELOAD_SCHEMA_VERSION,
          },
          {
            header: {
              kind: AdminSettingsReloadKind.Request,
              schema_version: ADMIN_SETTINGS_RELOAD_SCHEMA_VERSION,
              operation_name: AdminSettingsReloadOperationName.ApplyReload,
            },
            detail: {
              kind: AdminSettingsReloadKind.Request,
              schema_version: ADMIN_SETTINGS_RELOAD_SCHEMA_VERSION,
            } satisfies AdminSettingsReloadRequestDetail,
          },
        ),
    },
    logs: {
      records: (query?: AdminLogQuery) =>
        client.getDetail<AdminLogRecordListPayload>(
          ADMIN_LOG_RECORDS_PATH,
          {
            limit: ADMIN_OPS_DEFAULT_LIMIT,
            ...query,
          },
          {
            expectedKind: AdminLogPayloadKind.LogRecordList,
            expectedOperationName: AdminLogOperationName.LogRecordList,
            expectedSchemaVersion: ADMIN_LOG_SCHEMA_VERSION,
          },
        ),
      securityEvents: (query?: AdminSecurityEventQuery) =>
        client.getDetail<AdminSecurityEventListPayload>(
          ADMIN_SECURITY_EVENTS_PATH,
          {
            limit: ADMIN_OPS_DEFAULT_LIMIT,
            ...query,
          },
          {
            expectedKind: AdminLogPayloadKind.SecurityEventList,
            expectedOperationName: AdminLogOperationName.SecurityEventList,
            expectedSchemaVersion: ADMIN_LOG_SCHEMA_VERSION,
          },
        ),
    },
    security: securityClient.ipBlocks,
    systemOverview: {
      info: () =>
        client.request<SystemOverviewAdminPayload>(SYSTEM_INFO_PATH, {
          method: 'GET',
        }),
      live: () =>
        client.request<HealthProbePayload>(HEALTH_LIVE_PATH, {
          method: 'GET',
        }),
      ready: () =>
        client.request<HealthProbePayload>(HEALTH_READY_PATH, {
          method: 'GET',
        }),
    },
  }
}
