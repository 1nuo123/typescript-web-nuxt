import type { AppNavItem } from '../types/app'
import { RuntimeFeatureFlag } from '../types/app'
import { AdminBoundaryPolicy, AuthRole, AuthScope } from '../types/auth'
import {
  ADMIN_AUDIT_ROUTE,
  ADMIN_IDENTITY_ROLES_ROUTE,
  ADMIN_IDENTITY_ROUTE,
  ADMIN_IDENTITY_SCOPES_ROUTE,
  ADMIN_IDENTITY_USERS_ROUTE,
  ADMIN_OPS_LOGS_ROUTE,
  ADMIN_OPS_ROUTE,
  ADMIN_OPS_SECURITY_ROUTE,
  ADMIN_OPS_SETTINGS_ROUTE,
  ADMIN_OPS_SYSTEM_ROUTE,
  ADMIN_OPS_TASKS_ROUTE,
  ADMIN_ROUTE_PREFIX,
} from '../types/routes'

export enum AdminRouteModule {
  Hub = 'hub',
  Identity = 'identity',
  Ops = 'ops',
}

export interface AdminRouteEntry extends AppNavItem {
  title: string
  description: string
  module: AdminRouteModule
}

export const ADMIN_ROUTE_ENTRY_HUB: AdminRouteEntry = {
  label: '后台总览',
  title: '后台总览',
  description: '按当前主体权限裁剪业务后台与运维控制面入口。',
  to: ADMIN_ROUTE_PREFIX,
  requiresAuth: true,
  requiredRoles: [AuthRole.Admin],
  module: AdminRouteModule.Hub,
}

export const ADMIN_ROUTE_ENTRY_IDENTITY: AdminRouteEntry = {
  label: '身份管理',
  title: '身份管理',
  description: '维护管理员用户、角色与 scope。',
  to: ADMIN_IDENTITY_ROUTE,
  requiresAuth: true,
  requiredRoles: [AuthRole.Admin],
  requiredScopes: [AuthScope.AuthRead],
  adminBoundaryPolicy: AdminBoundaryPolicy.BusinessAdmin,
  module: AdminRouteModule.Hub,
}

export const ADMIN_ROUTE_ENTRY_AUDIT: AdminRouteEntry = {
  label: '业务审计',
  title: '业务审计',
  description: '查询后台身份变更与业务审计事件。',
  to: ADMIN_AUDIT_ROUTE,
  requiresAuth: true,
  requiredRoles: [AuthRole.Admin],
  requiredScopes: [AuthScope.AuthRead],
  adminBoundaryPolicy: AdminBoundaryPolicy.BusinessAdmin,
  module: AdminRouteModule.Hub,
}

export const ADMIN_ROUTE_ENTRY_OPS: AdminRouteEntry = {
  label: '运维控制面',
  title: '运维控制面',
  description: '查看系统、任务、日志、配置与安全防护状态。',
  to: ADMIN_OPS_ROUTE,
  requiresAuth: true,
  requiredRoles: [AuthRole.Admin],
  requiredScopes: [AuthScope.SystemRead],
  adminBoundaryPolicy: AdminBoundaryPolicy.OpsOnly,
  requiredRuntimeFlag: RuntimeFeatureFlag.AdminOps,
  module: AdminRouteModule.Hub,
}

export const ADMIN_ROUTE_ENTRY_USERS: AdminRouteEntry = {
  label: '用户',
  title: '管理员用户',
  description: '查询、创建、启停与维护管理员账号。',
  to: ADMIN_IDENTITY_USERS_ROUTE,
  requiresAuth: true,
  requiredRoles: [AuthRole.Admin],
  requiredScopes: [AuthScope.AuthRead],
  adminBoundaryPolicy: AdminBoundaryPolicy.BusinessAdmin,
  module: AdminRouteModule.Identity,
}

export const ADMIN_ROUTE_ENTRY_ROLES: AdminRouteEntry = {
  label: '角色',
  title: '角色管理',
  description: '维护角色与 scope 绑定关系。',
  to: ADMIN_IDENTITY_ROLES_ROUTE,
  requiresAuth: true,
  requiredRoles: [AuthRole.Admin],
  requiredScopes: [AuthScope.AuthRead],
  adminBoundaryPolicy: AdminBoundaryPolicy.BusinessAdmin,
  module: AdminRouteModule.Identity,
}

export const ADMIN_ROUTE_ENTRY_SCOPES: AdminRouteEntry = {
  label: 'Scope',
  title: 'Scope 管理',
  description: '查看和维护后台权限 scope。',
  to: ADMIN_IDENTITY_SCOPES_ROUTE,
  requiresAuth: true,
  requiredRoles: [AuthRole.Admin],
  requiredScopes: [AuthScope.AuthRead],
  adminBoundaryPolicy: AdminBoundaryPolicy.BusinessAdmin,
  module: AdminRouteModule.Identity,
}

export const ADMIN_ROUTE_ENTRY_TASKS: AdminRouteEntry = {
  label: '任务',
  title: '任务管理',
  description: '任务运行时、注册、执行记录与派发。',
  to: ADMIN_OPS_TASKS_ROUTE,
  requiresAuth: true,
  requiredRoles: [AuthRole.Admin],
  requiredScopes: [AuthScope.SystemRead],
  adminBoundaryPolicy: AdminBoundaryPolicy.OpsOnly,
  requiredRuntimeFlag: RuntimeFeatureFlag.AdminOps,
  module: AdminRouteModule.Ops,
}

export const ADMIN_ROUTE_ENTRY_SETTINGS: AdminRouteEntry = {
  label: '配置',
  title: '配置热更新',
  description: '配置热更新候选读取与执行。',
  to: ADMIN_OPS_SETTINGS_ROUTE,
  requiresAuth: true,
  requiredRoles: [AuthRole.Admin],
  requiredScopes: [AuthScope.SystemRead],
  adminBoundaryPolicy: AdminBoundaryPolicy.OpsOnly,
  requiredRuntimeFlag: RuntimeFeatureFlag.AdminOps,
  module: AdminRouteModule.Ops,
}

export const ADMIN_ROUTE_ENTRY_LOGS: AdminRouteEntry = {
  label: '日志',
  title: '日志查询',
  description: '运行日志与安全事件查询。',
  to: ADMIN_OPS_LOGS_ROUTE,
  requiresAuth: true,
  requiredRoles: [AuthRole.Admin],
  requiredScopes: [AuthScope.SystemRead],
  adminBoundaryPolicy: AdminBoundaryPolicy.OpsOnly,
  requiredRuntimeFlag: RuntimeFeatureFlag.AdminOps,
  module: AdminRouteModule.Ops,
}

export const ADMIN_ROUTE_ENTRY_SECURITY: AdminRouteEntry = {
  label: '安全防护',
  title: '安全防护',
  description: 'IP 封禁记录、手动封禁与释放。',
  to: ADMIN_OPS_SECURITY_ROUTE,
  requiresAuth: true,
  requiredRoles: [AuthRole.Admin],
  requiredScopes: [AuthScope.SystemRead, AuthScope.SecurityManage],
  adminBoundaryPolicy: AdminBoundaryPolicy.OpsOnly,
  requiredRuntimeFlag: RuntimeFeatureFlag.AdminOps,
  module: AdminRouteModule.Ops,
}

export const ADMIN_ROUTE_ENTRY_SYSTEM: AdminRouteEntry = {
  label: '系统概览',
  title: '系统概览',
  description: '系统信息与健康探针。',
  to: ADMIN_OPS_SYSTEM_ROUTE,
  requiresAuth: true,
  requiredRoles: [AuthRole.Admin],
  requiredScopes: [AuthScope.SystemRead],
  adminBoundaryPolicy: AdminBoundaryPolicy.OpsOnly,
  requiredRuntimeFlag: RuntimeFeatureFlag.AdminOps,
  module: AdminRouteModule.Ops,
}

export const ADMIN_HUB_ROUTE_ENTRIES: AdminRouteEntry[] = [
  ADMIN_ROUTE_ENTRY_IDENTITY,
  ADMIN_ROUTE_ENTRY_AUDIT,
  ADMIN_ROUTE_ENTRY_OPS,
]

export const ADMIN_IDENTITY_ROUTE_ENTRIES: AdminRouteEntry[] = [
  ADMIN_ROUTE_ENTRY_USERS,
  ADMIN_ROUTE_ENTRY_ROLES,
  ADMIN_ROUTE_ENTRY_SCOPES,
]

export const ADMIN_OPS_ROUTE_ENTRIES: AdminRouteEntry[] = [
  ADMIN_ROUTE_ENTRY_TASKS,
  ADMIN_ROUTE_ENTRY_SETTINGS,
  ADMIN_ROUTE_ENTRY_LOGS,
  ADMIN_ROUTE_ENTRY_SECURITY,
  ADMIN_ROUTE_ENTRY_SYSTEM,
]

export const ADMIN_ROUTE_REGISTRY: AdminRouteEntry[] = [
  ADMIN_ROUTE_ENTRY_HUB,
  ...ADMIN_HUB_ROUTE_ENTRIES,
  ...ADMIN_IDENTITY_ROUTE_ENTRIES,
  ...ADMIN_OPS_ROUTE_ENTRIES,
]

export const ADMIN_PRIMARY_NAV_ITEMS: AppNavItem[] = [
  ADMIN_ROUTE_ENTRY_HUB,
  ADMIN_ROUTE_ENTRY_IDENTITY,
  ADMIN_ROUTE_ENTRY_AUDIT,
  ADMIN_ROUTE_ENTRY_OPS,
]
