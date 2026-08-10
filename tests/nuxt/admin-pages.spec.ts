import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminIndexPage from '~/pages/admin/index.vue'
import AuditPage from '~/pages/admin/audit/index.vue'
import IdentityIndexPage from '~/pages/admin/identity/index.vue'
import RolesPage from '~/pages/admin/identity/roles.vue'
import UsersPage from '~/pages/admin/identity/users.vue'
import OpsSettingsPage from '~/pages/admin/ops/settings.vue'
import LoginPage from '~/pages/login.vue'
import { HttpFaultKind, ResponseEnvelopeCode } from '~/types/api'
import {
  AdminAuditOperationName,
  AdminAuditPayloadKind,
} from '~/types/admin-audit'
import {
  AdminIdentityOperationName,
  AdminIdentityPayloadKind,
} from '~/types/admin-identity'
import {
  AdminSettingsReloadKind,
  AdminSettingsReloadOperationName,
} from '~/types/admin-ops'
import { RuntimeFeatureFlag } from '~/types/app'
import {
  AdminBoundaryPolicy,
  AUTH_BEARER_TOKEN_TYPE,
  AuthRole,
  AuthScope,
  AuthSessionStatus,
} from '~/types/auth'
import { ADMIN_ROUTE_PREFIX } from '~/types/routes'
import {
  ADMIN_HUB_ROUTE_ENTRIES,
  ADMIN_IDENTITY_ROUTE_ENTRIES,
  ADMIN_OPS_ROUTE_ENTRIES,
  ADMIN_ROUTE_REGISTRY,
} from '~/utils/admin-routes'

const successHeader = {
  code: ResponseEnvelopeCode.Success,
  message: 'ok',
  request_id: 'request-1',
}

const ADMIN_SCHEMA_VERSION = '1.0'
const AUTH_CREDENTIALS_INVALID_ERROR_CODE = 'auth.credentials.invalid'
const PROJECT_ROOT_PATH = process.cwd()
const ADMIN_PAGES_ROOT_RELATIVE_PATH = 'app/pages/admin'
const ADMIN_PAGE_SCAN_INITIAL_RELATIVE_PATH = ''
const ADMIN_PAGE_EXTENSION = '.vue'
const NUXT_INDEX_PAGE_NAME = 'index'
const ROUTE_PATH_SEPARATOR = '/'
const WINDOWS_PATH_SEPARATOR_PATTERN = /\\/g
const ADMIN_PAGE_INDEX_SUFFIX = `${ROUTE_PATH_SEPARATOR}${NUXT_INDEX_PAGE_NAME}`

const invalidLoginError = {
  statusCode: 401,
  data: {
    header: {
      code: AUTH_CREDENTIALS_INVALID_ERROR_CODE,
      message: 'invalid credentials',
      request_id: 'request-login-invalid',
      trace_id: 'trace-login-invalid',
    },
    data: {
      kind: HttpFaultKind.HttpFault,
      schema_version: ADMIN_SCHEMA_VERSION,
      status_code: 401,
      error_code: AUTH_CREDENTIALS_INVALID_ERROR_CODE,
    },
  },
}

const adminDetailEnvelope = (
  detail: unknown,
  kind: string,
  operationName: string,
) => ({
  header: successHeader,
  data: {
    header: {
      kind,
      schema_version: ADMIN_SCHEMA_VERSION,
      operation_name: operationName,
    },
    detail,
  },
})

const applyAdminSession = (scopes: AuthScope[]) => {
  const authStore = useAuthStore()

  authStore.status = AuthSessionStatus.Authenticated
  authStore.accessToken = 'access-token'
  authStore.tokenType = AUTH_BEARER_TOKEN_TYPE
  authStore.principal = {
    kind: 'authenticated_principal',
    subject_id: 'subject-1',
    username: 'admin',
    roles: [AuthRole.Admin],
    scopes,
    is_admin: true,
  }
}

const routeHrefs = (component: VueWrapper) =>
  component
    .findAll('a')
    .map((link) => link.attributes('href'))
    .filter((href): href is string => Boolean(href))

describe('admin pages', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useRuntimeConfig().public[RuntimeFeatureFlag.AdminOps] = false
    useAuthStore().$reset()
  })

  it('renders the generic login page without calling the backend before submit', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('$fetch', fetchMock)

    const component = await mountSuspended(LoginPage)

    expect(component.find('form').exists()).toBe(true)
    expect(component.find('input[name="username"]').exists()).toBe(true)
    expect(component.find('input[name="password"]').exists()).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    component.unmount()
  })

  it('restores login form state after a rejected login', async () => {
    const fetchMock = vi.fn().mockRejectedValue(invalidLoginError)
    vi.stubGlobal('$fetch', fetchMock)

    const component = await mountSuspended(LoginPage)

    await component.get('input[name="username"]').setValue('admin')
    await component.get('input[name="password"]').setValue('wrong-password')
    await component.get('form').trigger('submit')
    await flushPromises()

    expect(component.get('input[name="username"]').attributes('disabled')).toBe(
      undefined,
    )
    expect(component.get('input[name="password"]').attributes('disabled')).toBe(
      undefined,
    )
    expect(component.get('button[type="submit"]').attributes('disabled')).toBe(
      undefined,
    )
    expect(useAuthStore().status).toBe(AuthSessionStatus.Anonymous)
    component.unmount()
  })

  it('renders admin overview business routes for business admins', async () => {
    applyAdminSession([AuthScope.AuthRead])

    const component = await mountSuspended(AdminIndexPage)
    const hrefs = routeHrefs(component)

    expect(hrefs).toContain('/admin/identity')
    expect(hrefs).toContain('/admin/audit')
    expect(hrefs).not.toContain('/admin/ops')
    component.unmount()
  })

  it('renders ops entry for system admins through the neutral admin hub', async () => {
    useRuntimeConfig().public[RuntimeFeatureFlag.AdminOps] = true
    applyAdminSession([AuthScope.SystemRead])

    const component = await mountSuspended(AdminIndexPage)
    const hrefs = routeHrefs(component)

    expect(hrefs).toContain('/admin/ops')
    expect(hrefs).not.toContain('/admin/audit')
    component.unmount()
  })

  it('renders identity module navigation', async () => {
    applyAdminSession([AuthScope.AuthRead, AuthScope.AuthManage])

    const component = await mountSuspended(IdentityIndexPage)
    const hrefs = routeHrefs(component)

    expect(hrefs).toContain('/admin/identity/users')
    expect(hrefs).toContain('/admin/identity/roles')
    expect(hrefs).toContain('/admin/identity/scopes')
    component.unmount()
  })

  it('loads an empty users page through the identity client', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      adminDetailEnvelope(
        {
          kind: AdminIdentityPayloadKind.UserList,
          schema_version: ADMIN_SCHEMA_VERSION,
          users: [],
          page_size: 20,
          offset: 0,
          total: 0,
        },
        AdminIdentityPayloadKind.UserList,
        AdminIdentityOperationName.UserList,
      ),
    )
    vi.stubGlobal('$fetch', fetchMock)
    applyAdminSession([AuthScope.AuthRead, AuthScope.AuthManage])

    const component = await mountSuspended(UsersPage)
    await flushPromises()

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/admin/users')
    expect(fetchMock.mock.calls[0]?.[1]?.query).toMatchObject({
      page_size: 20,
      offset: 0,
    })
    component.unmount()
  })

  it('keeps business roles in a read-only list outside role mutations', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        adminDetailEnvelope(
          {
            kind: AdminIdentityPayloadKind.RoleList,
            schema_version: ADMIN_SCHEMA_VERSION,
            roles: [],
            page_size: 20,
            offset: 0,
            total: 0,
          },
          AdminIdentityPayloadKind.RoleList,
          AdminIdentityOperationName.RoleList,
        ),
      )
      .mockResolvedValueOnce(
        adminDetailEnvelope(
          {
            kind: AdminIdentityPayloadKind.BusinessRoleList,
            schema_version: ADMIN_SCHEMA_VERSION,
            roles: [
              {
                kind: AdminIdentityPayloadKind.BusinessRole,
                schema_version: ADMIN_SCHEMA_VERSION,
                role_key: 'tenant-owner',
                role_name: 'Tenant owner',
              },
            ],
            page_size: 20,
            offset: 0,
            total: 1,
          },
          AdminIdentityPayloadKind.BusinessRoleList,
          AdminIdentityOperationName.RoleList,
        ),
      )
    vi.stubGlobal('$fetch', fetchMock)
    applyAdminSession([AuthScope.AuthRead])

    const component = await mountSuspended(RolesPage)
    await flushPromises()

    const buttons = component.findAll('button')
    expect(buttons.length).toBeGreaterThanOrEqual(2)
    await buttons[buttons.length - 1]?.trigger('click')
    await flushPromises()

    expect(fetchMock.mock.calls[1]?.[0]).toBe('/admin/business-roles')
    expect(component.text()).toContain('tenant-owner')
    component.unmount()
  })

  it('requires system manage scope before showing settings reload execution', async () => {
    const candidateEnvelope = adminDetailEnvelope(
      {
        kind: AdminSettingsReloadKind.Candidate,
        schema_version: ADMIN_SCHEMA_VERSION,
        candidate_version: 'v1',
        digest: 'digest-1',
      },
      AdminSettingsReloadKind.Candidate,
      AdminSettingsReloadOperationName.ReadCandidate,
    )

    let fetchMock = vi.fn().mockResolvedValue(candidateEnvelope)
    vi.stubGlobal('$fetch', fetchMock)

    applyAdminSession([AuthScope.SystemRead])
    const readOnlyComponent = await mountSuspended(OpsSettingsPage)
    await flushPromises()

    expect(readOnlyComponent.findAll('button')).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    readOnlyComponent.unmount()

    useAuthStore().$reset()
    fetchMock = vi
      .fn()
      .mockResolvedValueOnce(candidateEnvelope)
      .mockResolvedValueOnce(
        adminDetailEnvelope(
          {
            kind: AdminSettingsReloadKind.Result,
            schema_version: ADMIN_SCHEMA_VERSION,
            success: true,
            rolled_back: false,
            reason: null,
            candidate_version: 'v1',
            restored_resources: [],
            active_snapshot_id: 'snapshot-1',
          },
          AdminSettingsReloadKind.Result,
          AdminSettingsReloadOperationName.ReloadResult,
        ),
      )
    vi.stubGlobal('$fetch', fetchMock)

    applyAdminSession([AuthScope.SystemRead, AuthScope.SystemManage])
    const manageComponent = await mountSuspended(OpsSettingsPage)
    await flushPromises()

    const buttons = manageComponent.findAll('button')
    expect(buttons).toHaveLength(2)
    await buttons[1]?.trigger('click')
    await flushPromises()

    expect(fetchMock.mock.calls[1]?.[0]).toBe('/admin/settings/reload')
    manageComponent.unmount()
  })

  it('loads audit events through the audit client', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      adminDetailEnvelope(
        {
          kind: AdminAuditPayloadKind.EventList,
          schema_version: ADMIN_SCHEMA_VERSION,
          events: [],
          page_size: 20,
          offset: 0,
          total: 0,
        },
        AdminAuditPayloadKind.EventList,
        AdminAuditOperationName.EventList,
      ),
    )
    vi.stubGlobal('$fetch', fetchMock)
    applyAdminSession([AuthScope.AuthRead])

    const component = await mountSuspended(AuditPage)
    await flushPromises()

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/admin/audit-events')
    component.unmount()
  })

  it('keeps admin route registry grouped by visible modules', () => {
    expect(ADMIN_HUB_ROUTE_ENTRIES.map((item) => item.to)).toEqual([
      '/admin/identity',
      '/admin/audit',
      '/admin/ops',
    ])
    expect(ADMIN_IDENTITY_ROUTE_ENTRIES.map((item) => item.to)).toEqual([
      '/admin/identity/users',
      '/admin/identity/roles',
      '/admin/identity/scopes',
    ])
    expect(ADMIN_OPS_ROUTE_ENTRIES.map((item) => item.to)).toEqual([
      '/admin/ops/tasks',
      '/admin/ops/settings',
      '/admin/ops/logs',
      '/admin/ops/security',
      '/admin/ops/system',
    ])
  })

  it('keeps admin page files and route meta aligned with the registry', () => {
    const registeredRoutes = ADMIN_ROUTE_REGISTRY.map((item) => item.to).sort()
    const adminPagesRootPath = resolve(
      PROJECT_ROOT_PATH,
      ADMIN_PAGES_ROOT_RELATIVE_PATH,
    )
    const scanStack: string[] = [ADMIN_PAGE_SCAN_INITIAL_RELATIVE_PATH]
    const discoveredPageRoutes = new Map<string, string>()

    while (scanStack.length > 0) {
      const relativeDirectoryPath =
        scanStack.pop() ?? ADMIN_PAGE_SCAN_INITIAL_RELATIVE_PATH
      const directoryPath = resolve(adminPagesRootPath, relativeDirectoryPath)

      for (const directoryEntry of readdirSync(directoryPath, {
        withFileTypes: true,
      })) {
        const relativeEntryPath =
          relativeDirectoryPath.length > 0
            ? `${relativeDirectoryPath}${ROUTE_PATH_SEPARATOR}${directoryEntry.name}`
            : directoryEntry.name

        if (directoryEntry.isDirectory()) {
          scanStack.push(relativeEntryPath)
          continue
        }

        if (
          !directoryEntry.isFile() ||
          !directoryEntry.name.endsWith(ADMIN_PAGE_EXTENSION)
        ) {
          continue
        }

        const routeFilePath = relativeEntryPath.replace(
          WINDOWS_PATH_SEPARATOR_PATTERN,
          ROUTE_PATH_SEPARATOR,
        )
        const routeWithoutExtension = routeFilePath.slice(
          0,
          -ADMIN_PAGE_EXTENSION.length,
        )
        let routeSuffix = routeWithoutExtension

        if (routeSuffix === NUXT_INDEX_PAGE_NAME) {
          routeSuffix = ADMIN_PAGE_SCAN_INITIAL_RELATIVE_PATH
        } else if (routeSuffix.endsWith(ADMIN_PAGE_INDEX_SUFFIX)) {
          routeSuffix = routeSuffix.slice(0, -ADMIN_PAGE_INDEX_SUFFIX.length)
        }

        const routePath =
          routeSuffix.length > 0
            ? `${ADMIN_ROUTE_PREFIX}${ROUTE_PATH_SEPARATOR}${routeSuffix}`
            : ADMIN_ROUTE_PREFIX

        discoveredPageRoutes.set(routePath, routeFilePath)
      }
    }

    const mappedRoutes = [...discoveredPageRoutes.keys()].sort()

    expect(mappedRoutes).toEqual(registeredRoutes)

    for (const entry of ADMIN_ROUTE_REGISTRY) {
      const pagePath = discoveredPageRoutes.get(entry.to)
      expect(pagePath).toBeDefined()
      if (!pagePath) {
        continue
      }
      const fullPath = resolve(
        PROJECT_ROOT_PATH,
        ADMIN_PAGES_ROOT_RELATIVE_PATH,
        pagePath,
      )

      expect(existsSync(fullPath)).toBe(true)

      const pageSource = readFileSync(fullPath, 'utf8')
      expect(pageSource).toContain('definePageMeta')
      if (!pageSource.includes(entry.title)) {
        throw new Error(
          `Admin route title mismatch: ${entry.to} should use ${entry.title}`,
        )
      }

      for (const role of entry.requiredRoles ?? []) {
        const roleName = Object.entries(AuthRole).find(
          ([, value]) => value === role,
        )?.[0]

        expect(pageSource).toContain(`AuthRole.${roleName}`)
      }

      for (const scope of entry.requiredScopes ?? []) {
        const scopeName = Object.entries(AuthScope).find(
          ([, value]) => value === scope,
        )?.[0]

        expect(pageSource).toContain(`AuthScope.${scopeName}`)
      }

      if (entry.adminBoundaryPolicy) {
        const boundaryName = Object.entries(AdminBoundaryPolicy).find(
          ([, value]) => value === entry.adminBoundaryPolicy,
        )?.[0]

        expect(pageSource).toContain(`AdminBoundaryPolicy.${boundaryName}`)
      }

      if (entry.requiredRuntimeFlag) {
        const flagName = Object.entries(RuntimeFeatureFlag).find(
          ([, value]) => value === entry.requiredRuntimeFlag,
        )?.[0]

        expect(pageSource).toContain(`RuntimeFeatureFlag.${flagName}`)
      }
    }
  })
})
