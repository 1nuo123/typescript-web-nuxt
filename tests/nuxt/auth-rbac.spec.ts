import { afterEach, describe, expect, it } from 'vitest'
import {
  AdminBoundaryPolicy,
  AuthRole,
  AuthScope,
  AuthSessionStatus,
  PermissionMode,
} from '~/types/auth'
import type { AppNavItem } from '~/types/app'

const principal = {
  kind: 'authenticated_principal' as const,
  subject_id: 'subject-1',
  username: 'admin',
  roles: [AuthRole.Admin],
  scopes: [AuthScope.AuthRead, AuthScope.AuthManage],
  is_admin: true,
}

describe('auth RBAC helpers', () => {
  afterEach(() => {
    useAuthStore().$reset()
  })

  it('applies admin boundary policy requirements to navigation items', () => {
    const authStore = useAuthStore()
    authStore.status = AuthSessionStatus.Authenticated
    authStore.principal = principal

    const items: AppNavItem[] = [
      {
        label: '公开',
        to: '/',
        adminBoundaryPolicy: AdminBoundaryPolicy.Public,
      },
      {
        label: '身份',
        to: '/admin',
        requiresAuth: true,
        adminBoundaryPolicy: AdminBoundaryPolicy.BusinessAdmin,
      },
      {
        label: '运维',
        to: '/ops',
        requiresAuth: true,
        adminBoundaryPolicy: AdminBoundaryPolicy.OpsOnly,
      },
    ]

    expect(
      authStore.filterNavigationItems(items).map((item) => item.label),
    ).toEqual(['公开', '身份'])
  })

  it('does not let Any mode bypass the admin boundary policy', () => {
    const authStore = useAuthStore()
    authStore.status = AuthSessionStatus.Authenticated
    authStore.principal = {
      ...principal,
      scopes: [AuthScope.AuthManage],
    }

    expect(
      authStore.can({
        adminBoundaryPolicy: AdminBoundaryPolicy.BusinessAdmin,
        requiredScopes: [AuthScope.AuthManage],
        permissionMode: PermissionMode.Any,
      }),
    ).toBe(false)
  })
})
