export const PUBLIC_HOME_ROUTE = '/'
export const ACCOUNT_ROUTE = '/account'
export const LOGIN_ROUTE = '/login'
export const REGISTER_ROUTE = '/register'
export const ADMIN_ROUTE_PREFIX = '/admin'
export const ADMIN_IDENTITY_ROUTE = '/admin/identity'
export const ADMIN_IDENTITY_USERS_ROUTE = '/admin/identity/users'
export const ADMIN_IDENTITY_ROLES_ROUTE = '/admin/identity/roles'
export const ADMIN_IDENTITY_SCOPES_ROUTE = '/admin/identity/scopes'
export const ADMIN_AUDIT_ROUTE = '/admin/audit'
export const ADMIN_OPS_ROUTE = '/admin/ops'
export const ADMIN_OPS_TASKS_ROUTE = '/admin/ops/tasks'
export const ADMIN_OPS_SETTINGS_ROUTE = '/admin/ops/settings'
export const ADMIN_OPS_LOGS_ROUTE = '/admin/ops/logs'
export const ADMIN_OPS_SECURITY_ROUTE = '/admin/ops/security'
export const ADMIN_OPS_SYSTEM_ROUTE = '/admin/ops/system'
export const CODEX_ROUTE_PREFIX = '/codex'
export const CODEX_TASKS_ROUTE = '/codex/tasks'
export const CODEX_APPROVALS_ROUTE = '/codex/approval-center'
export const CODEX_PROJECTS_ROUTE = '/codex/projects'
export const CODEX_SETTINGS_ROUTE = '/codex/settings'
export const CODEX_EXECUTION_SETTINGS_ROUTE = '/codex/settings/execution'

export interface CodexTaskRoute {
  hostId?: string
  workspaceId?: string
  threadId?: string
  searchTerm?: string
  archived?: boolean
}

export interface CodexApprovalsRoute {
  threadId?: string
  returnTo?: string
}

/** 任务列表筛选必须写入链接，才能在刷新与浏览器导航后恢复相同结果集。 */
const appendCodexTaskRouteQuery = (
  query: URLSearchParams,
  route: Pick<
    CodexTaskRoute,
    'hostId' | 'workspaceId' | 'searchTerm' | 'archived'
  >,
): void => {
  if (route.hostId) query.set('hostId', route.hostId)
  if (route.workspaceId) query.set('workspaceId', route.workspaceId)
  if (route.searchTerm?.trim()) query.set('search', route.searchTerm.trim())
  if (route.archived) query.set('archived', 'true')
}

export const buildCodexTaskRoute = (
  threadId: string,
  route: Pick<
    CodexTaskRoute,
    'hostId' | 'workspaceId' | 'searchTerm' | 'archived'
  > = {},
): string => {
  const query = new URLSearchParams()
  appendCodexTaskRouteQuery(query, route)
  const queryString = query.toString()
  return `${CODEX_TASKS_ROUTE}/${encodeURIComponent(threadId)}${
    queryString ? `?${queryString}` : ''
  }`
}

export const buildCodexTasksRoute = (
  route: Pick<
    CodexTaskRoute,
    'hostId' | 'workspaceId' | 'searchTerm' | 'archived'
  > = {},
): string => {
  const query = new URLSearchParams()
  appendCodexTaskRouteQuery(query, route)
  const queryString = query.toString()
  return `${CODEX_TASKS_ROUTE}${queryString ? `?${queryString}` : ''}`
}

/** 审批中心只接受当前应用内的任务返回地址，避免把用户输入当作导航目标。 */
export const buildCodexApprovalsRoute = (
  route: CodexApprovalsRoute = {},
): string => {
  const query = new URLSearchParams()
  if (route.threadId) query.set('threadId', route.threadId)
  if (route.returnTo?.startsWith(`${CODEX_TASKS_ROUTE}/`)) {
    query.set('returnTo', route.returnTo)
  }
  const queryString = query.toString()
  return `${CODEX_APPROVALS_ROUTE}${queryString ? `?${queryString}` : ''}`
}

/** 运行设置保持独立页面，避免在会话主视图内展开后压缩时间线。 */
export const buildCodexExecutionSettingsRoute = (
  route: Pick<CodexTaskRoute, 'hostId' | 'workspaceId'> = {},
): string => {
  const query = new URLSearchParams()
  if (route.hostId) query.set('hostId', route.hostId)
  if (route.workspaceId) query.set('workspaceId', route.workspaceId)
  const queryString = query.toString()
  return `${CODEX_EXECUTION_SETTINGS_ROUTE}${
    queryString ? `?${queryString}` : ''
  }`
}

export const buildCodexProjectRoute = (
  workspaceId: string,
  route: Pick<CodexTaskRoute, 'hostId'> = {},
): string => {
  const query = new URLSearchParams()
  if (route.hostId) query.set('hostId', route.hostId)
  const queryString = query.toString()
  return `${CODEX_PROJECTS_ROUTE}/${encodeURIComponent(workspaceId)}${
    queryString ? `?${queryString}` : ''
  }`
}

export const AUTH_GUEST_ROUTES = [LOGIN_ROUTE, REGISTER_ROUTE] as const
