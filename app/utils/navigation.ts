import { RuntimeFeatureFlag, type AppNavItem } from '../types/app'
import { AdminBoundaryPolicy, AuthScope } from '../types/auth'
import { CODEX_TASKS_ROUTE, PUBLIC_HOME_ROUTE } from '../types/routes'
import { ADMIN_PRIMARY_NAV_ITEMS } from './admin-routes'

export const APP_NAVIGATION_ITEMS: AppNavItem[] = [
  {
    label: '首页',
    to: PUBLIC_HOME_ROUTE,
    exact: true,
    adminBoundaryPolicy: AdminBoundaryPolicy.Public,
  },
  {
    label: 'Codex',
    to: CODEX_TASKS_ROUTE,
    requiresAuth: true,
    requiredScopes: [AuthScope.CodexRead],
    requiredRuntimeFlag: RuntimeFeatureFlag.Codex,
  },
  ...ADMIN_PRIMARY_NAV_ITEMS,
]
