import { AuthScope } from '~/types/auth'
import type { AppNavItem } from '~/types/app'
import {
  CODEX_APPROVALS_ROUTE,
  CODEX_PROJECTS_ROUTE,
  CODEX_SETTINGS_ROUTE,
  CODEX_TASKS_ROUTE,
} from '~/types/routes'

export const CODEX_NAVIGATION_ITEMS: AppNavItem[] = [
  {
    label: '任务',
    to: CODEX_TASKS_ROUTE,
    exact: false,
    requiresAuth: true,
    requiredScopes: [AuthScope.CodexRead],
  },
  {
    label: '审批',
    to: CODEX_APPROVALS_ROUTE,
    exact: false,
    requiresAuth: true,
    requiredScopes: [AuthScope.CodexApprove],
  },
  {
    label: '项目',
    to: CODEX_PROJECTS_ROUTE,
    exact: false,
    requiresAuth: true,
    requiredScopes: [AuthScope.CodexRead],
  },
  {
    label: '设置',
    to: CODEX_SETTINGS_ROUTE,
    exact: false,
    requiresAuth: true,
    requiredScopes: [AuthScope.CodexRead],
  },
]
