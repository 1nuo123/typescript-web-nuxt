# 后台管理接入前 Nuxt 骨架审查修复清单

审查日期：2026-06-04

后端复核日期：2026-06-05；后端源码范围：`E:/python_web_fastapi/work`

> 历史状态说明：本文中的“已完成 / 通过”均为 2026-06-06 本地环境复核记录，不作为当前发布门禁事实；当前发布以本轮任务清单和 `pnpm release:check` 输出为准。

## 总体结论

当前项目已经从“后台管理接入前骨架”推进到“后台管理首批闭环页面”：目录、配置、布局、基础组件、状态边界、请求层、错误页、测试入口都已经成型，并已加入认证、权限、后台 API client、主页隔离、通用登录页、注册状态页、业务后台页面与运维控制面页面。API auth 白名单、后台 client operation/kind 校验、运行时错误直接测试、覆盖率主门禁、链接焦点测试与 hydration 前主题 E2E 已完成收口，可作为后续后台模块接入的稳定基线。

本次执行后，原清单中 P0-3、P0-6、P1-2、P2-1、P2-4 已按真实源码、测试与文档状态回写为完成，并新增 `/login`、`/register`、`/admin/identity/**`、`/admin/audit`、`/admin/ops/**` 页面闭环。后端真实协议是 FastAPI OAuth2 Bearer 语义：`/auth/token`、`/auth/refresh`、`/auth/revoke` 都走 JSON body，受保护接口使用 `Authorization: Bearer <access_token>`，refresh token 会轮换且不由后端写 httpOnly cookie；当前后端未开放公开注册接口，注册页只展示真实不可用状态。当前已完成 SSR 可读会话边界、route meta/RBAC 的真实消费与测试、refresh 主流程、移动端焦点契约、断点契约、主题首屏测试、runtime 错误直接测试、coverage/release 主门禁、后台 API 模块 client 契约测试、页面渲染测试与 E2E 冒烟测试。

初次后端复核使用 5 个 `gpt-5.4 / reasoning_effort=high` 子智能体分别审查后端的认证 token/session 生命周期、RBAC 与 admin route 授权、HTTP 响应/错误 envelope、后台管理接口契约、安全中间件/CORS/部署边界。本次状态回归另使用 3 个并行子智能体分别复核 P0、P1、P2；如子智能体结果与本地源码复核冲突，以本地源码复核为准。

## 本地验证

- `pnpm format:check`：通过
- `pnpm lint`：通过
- `pnpm typecheck`：通过
- `pnpm test -- --run`：通过，17 个测试文件、69 个测试
- `pnpm test:e2e`：通过，6 个 Chromium 冒烟测试
- `pnpm build`：单独执行通过
- `pnpm verify`：通过，已包含 `pnpm test:coverage`、`pnpm build` 与 `pnpm test:e2e`
- `pnpm test:coverage`：通过，已启用关键基础设施文件覆盖率门槛
- Docker Compose 环境检查：前端项目目录未发现 Compose 配置，`docker compose up -d` 返回 `no configuration file provided: not found`，本次按方案降级使用本地项目环境执行真实测试与回归。

不作为当前修复项：Nuxt 性能报告输出、Tailwind sourcemap warning、Node 依赖链 deprecation warning。这些是工具/依赖噪音，当前不阻断构建；发布前再按依赖升级窗口处理即可。

## 2026-06-06 页面闭环回归

- 后端接口来源：`E:\python_web_fastapi\work\src\api`。如历史文档、图谱与源码冲突，以当前源码和已冻结契约为准，历史文档可能过期。
- 主页隔离：`/` 已恢复为空白占位，仅显示“首页”，不再直接承载管理员管理、身份管理、运维控制等具体后台功能。
- 认证入口：`/login` 是通用登录页，使用独立 `auth` 布局，不渲染管理员侧栏/顶部栏骨架；支持合法内部 `redirect` 回跳和会话错误展示；管理员账号无回跳时进入 `/admin`，普通账号无回跳时返回 `/`；匿名访问 `/admin/**` 按路径级路由守卫跳转到 `/login?redirect=...`。
- 注册入口：`/register` 是通用注册状态页，使用独立 `auth` 布局，不渲染管理员侧栏/顶部栏骨架；由于当前后端未开放公开注册接口，只展示“注册暂未开放”，不发起伪注册请求。
- 管理员退出：管理员区不提供单独登录页，只在布局中提供退出入口；退出会调用 `authStore.logout()` 并回到 `/login`。
- 业务后台：`/admin` 为后台总览；`/admin/identity/index`、`/admin/identity/users`、`/admin/identity/roles`、`/admin/identity/scopes`、`/admin/audit` 已按 `admin + auth:read/auth:manage` 边界接入，并已按真实后端返回的 `users/roles/scopes/events` 列表字段回归。
- 运维控制面：`/admin/ops/index`、`/admin/ops/tasks`、`/admin/ops/settings`、`/admin/ops/logs`、`/admin/ops/security`、`/admin/ops/system` 已按 `admin + system:read/task:dispatch/security:manage` 边界接入；默认由 `NUXT_PUBLIC_ADMIN_OPS_ENABLED=false` 隐藏并阻断，只有后端挂载运维路由后才启用。
- 契约规则：外层统一为 `ResponseEnvelope.header + ResponseEnvelope.data`，admin 模块在 `data` 内使用 `header + detail` 强类型扩展字段；`kind/schema_version/operation_name/detail` 均由 client 侧校验。
- 后端联调：已使用 `E:\python_web_fastapi\work` Compose 环境与 `http://127.0.0.1:8000` 复核管理员账号登录、`/auth/me`、用户、角色、scope 与审计页面；登录失败状态、SSR 错误序列化、默认 API baseURL 与运维开关已回归。

## P0：后台管理开工前必须修

### P0-1 建立独立认证/会话模型（已完成）

- 状态回归：已建立独立 `auth` store、token/session 状态机、当前主体、角色/scope、初始化、登录、`/auth/me`、刷新和登出承载点；会话已改为 SSR 可读 cookie 持久化，refresh 成功后原子替换 access/refresh token，并用 per-store refresh 锁避免并发刷新串扰。
- 相关位置：`app/stores/auth.ts`、`app/types/auth.ts`、`tests/nuxt/auth-session.spec.ts`
- 根因：当前只有 `sessionReady` 占位，且只有置真动作；没有适配后端 `Bearer access token + JSON refresh token rotation` 的 `auth/session` 状态机、当前主体、角色/scope、初始化、刷新、登出承载点。
- 影响：后台页面会把登录态、`/auth/me`、角色/scope 判断、refresh 轮换、token 失效分流散写入页面或组件，后续很难维护。
- 前置条件：后端模式已确认：登录 `POST /auth/token` 请求 `{ username, password }`，刷新/注销分别请求 `{ refresh_token }` 到 `/auth/refresh`、`/auth/revoke`；登录成功只返回 token，当前用户以 `/auth/me` 返回的数据库实时快照为准。BFF/httpOnly cookie 是生产增强方案，不是当前后端默认契约。
- 修复方案：新增独立 `auth` store 或 `useSession` composable，至少包含 `status: anonymous/login_pending/authenticated/refreshing/throttled/disabled/forbidden/revoked/reused/error`、`accessToken`、`refreshToken`、`tokenType`、`expiresAt`、`refreshExpiresAt`、`principal`、`roles`、`scopes`、`isAdmin`、`initSession()`、`login()`、`fetchMe()`、`refresh()`、`logout()`。refresh 成功后必须原子替换 access/refresh token；`auth.token.reused`、`auth.token.revoked`、refresh 阶段的 `auth.token.invalid` 必须硬登出；`/auth/revoke` 失败时本地登出仍应完成。`app` store 继续只放 UI 状态，不承载认证细节。

### P0-2 补路由守卫与页面 meta 权限合约（已完成）

- 状态回归：`route-meta.d.ts` 与全局 middleware 已接入 `requiresAuth/guestOnly/requiredRoles/requiredScopes/permissionMode/adminBoundaryPolicy/redirectTo` 合约；`/admin` 受保护占位页和守卫测试已真实消费 meta，`business_admin/ops_only` 已由 auth store 映射为可执行边界。
- 相关位置：`app/types/route-meta.d.ts`、`app/middleware/framework.global.ts`、`app/pages/admin/index.vue`、`tests/nuxt/route-middleware.spec.ts`、`tests/e2e/smoke.spec.ts`
- 根因：全局 middleware 只处理标题，页面 meta 只有 `title/layout`，没有 `requiresAuth`、`guestOnly`、`requiredRoles`、`requiredScopes`、`adminBoundaryPolicy`、`redirectTo` 等访问策略。
- 影响：未来 `/admin/**` 默认公开，容易出现未授权内容闪现、SSR/CSR 跳转不一致、页面内重复鉴权；仅凭 `isAdmin` 或 JWT claims 判断会和后端实时授权模型不一致。
- 前置条件：先确定后台路由分区、登录页、403 页面、未登录 redirect 规则；若未来接外部 OAuth provider，再单独增加 callback 白名单，当前后端本身没有浏览器 OAuth callback 流程。
- 修复方案：扩展 `definePageMeta` 类型合约；增加全局或命名 auth middleware，在进入受保护页面前 `await initSession()`。meta 建议使用 `requiresAuth`、`guestOnly`、`requiredRoles: ['admin']`、`requiredScopes: [...]`、`permissionMode: 'all'`、`adminBoundaryPolicy: 'business_admin' | 'ops_only'`；守卫数据源以 `/auth/me` 为准，不直接信本地 token。页面可见性和页面内动作权限分层表达，例如身份只读页是 `admin + auth:read`，身份写按钮是 `admin + auth:manage`，任务查询是 `admin + system:read`，任务派发按钮是 `admin + task:dispatch`。

### P0-3 改造请求层为 auth-aware API client（已完成）

- 状态回归：`useAuthenticatedApi()`、auth store refresh 锁、401 refresh-and-retry、refresh token 原子替换、`skipAuth` 主流程、`ApiAuthStrategy.Public` 与内置 `AUTH_PUBLIC_API_ENDPOINTS` 白名单均已实现并通过测试；`/auth/token`、`/auth/refresh`、`/auth/revoke` 在未显式传 `skipAuth` 时也不会自动携带 access token，受保护请求仍自动注入 `Authorization: Bearer <accessToken>`。
- 相关位置：`app/composables/useApi.ts`、`app/composables/useAuthenticatedApi.ts`、`app/stores/auth.ts`、`tests/nuxt/use-api.spec.ts`、`tests/nuxt/auth-session.spec.ts`
- 根因：当前请求层只支持附加 `Authorization: Bearer token`，没有按后端契约区分公共 auth 请求、受保护请求、401 refresh-and-retry、refresh 并发锁、refresh token 轮换原子替换、登录/刷新/注销请求豁免。
- 影响：过期 access token 如果被带到 `/auth/token`、`/auth/refresh`、`/auth/revoke` 或公开路由，会被后端全局 Bearer 绑定中间件提前 401；refresh 并发会触发旧 refresh token 二次使用，导致整个 token session 被吊销。
- 前置条件：确认前端部署策略：开发可直连后端 `apiBaseURL` 并使用 Bearer；生产最佳实践建议走 Nuxt server proxy/BFF，把 refresh token 留在服务端或 httpOnly same-site cookie 中。若选择浏览器直连，就必须明确接受浏览器侧持有 refresh token 的 XSS 风险。
- 修复方案：给 `ApiClientOptions` 增加 auth 策略和请求白名单；受保护请求注入 `Authorization: Bearer <accessToken>`，`/auth/token`、`/auth/refresh`、`/auth/revoke`、公共路由不得自动带 access token；实现单次 refresh 后重放原请求，并用共享 promise/锁避免并发刷新；refresh body 使用 `{ refresh_token }`，成功后同时替换 `accessToken/refreshToken/expiresAt/refreshExpiresAt`；把 `401/403/429` 等鉴权错误分类输出。`credentials: 'include'` 只在采用 BFF/cookie 策略时启用，不作为当前后端直连默认假设。
- 遗漏项补充：已补内置 auth public endpoint 白名单、显式 public auth 策略、未显式 `skipAuth` 时 `/auth/*` 不带 token、公共请求不带 token、受保护请求仍自动带 token 的测试。

### P0-4 让请求错误形状稳定，不被二次异常覆盖（已完成）

- 相关位置：`app/composables/useApi.ts:32`、`app/composables/useApi.ts:43`
- 根因：`getToken()` 在 `try` 外，`onError()` 在 catch 内直接 `await`；二者任意抛错都会绕开或覆盖原始 API 错误。当前错误归一化也没有适配后端 envelope：成功/失败顶层都是 `{ header, data }`，失败机器码主要在 `data.error_code`，不是顶层 `error_code` 或 FastAPI 常见 `detail`。
- 影响：上层可能拿不到统一 `ApiErrorPayload`，调试时会看到“本来是 401，最后却变成 token/onError 异常”；错误页也拿不到可复制的 `request_id/trace_id`。
- 前置条件：明确 `onError` 是旁路副作用，不应覆盖主错误；明确后端成功码为 `header.code = 'system.success.ok'`，失败为 `data.kind = 'http_fault'`。
- 修复方案：把 `getToken()` 纳入 `try`；对 `onError()` 单独 `try/catch`，记录二次失败但始终抛出原始 normalized error。`ApiErrorPayload` 至少包含 `code`、`errorCode`、`statusCode`、`message`、`requestId`、`traceId`、`kind`；优先从 `response._data.header` 与 `response._data.data` 读取，保留非 envelope 404/405、非 JSON、空响应 fallback；不要依赖 `detail`、字段级校验数组或 traceback；补 `getToken reject`、`onError reject`、envelope 401/403/422/429 分类测试。

### P0-5 给导航与页面配置补 RBAC 可见性模型（已完成）

- 状态回归：`AppNavItem` 权限字段、默认导航、布局过滤和 RBAC 裁剪测试已落地；导航由 auth/session 层统一执行 `role + scope + adminBoundaryPolicy` 判断，默认只暴露首页与身份管理入口。
- 相关位置：`app/types/app.ts:5`、`app.config.ts:2`、`app/layouts/default.vue:60`、`app/components/layout/AppHeader.vue:25`、`app/components/layout/AppSidebar.vue:27`
- 根因：`AppNavItem` 只有 `label/to/exact/disabled`，布局直接渲染全部导航；没有表达后端的 `admin role + route scope` 双条件授权，也没有区分业务后台和运维控制面。
- 影响：管理员菜单、角色裁剪、功能开关、按钮级 capability 会散落成各处 `v-if`；如果只用 `is_admin`，会把缺 scope 的账号误展示入口。
- 前置条件：权限命名直接跟随后端枚举，不另造 permission 体系：`role = 'admin'`，scope 包括 `auth:read`、`auth:manage`、`security:manage`、`system:read`、`task:dispatch`。后端 manifest 已有 `business_admin` 与 `ops_only` 分组；默认启用模块是 `auth_access`、`admin_identity`、`admin_audit`，task/settings/log/system/security 属于内置但不一定启用的运维控制面。
- 修复方案：扩展 `AppNavItem` 和页面 meta 的权限字段；由 auth/session 层提供 `canScope()`、`hasRole()`、`canAdminAction()` 或统一 `can()`；布局只接收过滤后的导航树，组件不直接理解业务权限。导航模型按模块映射：identity/audit 走 `business_admin`，task/settings/log/security/system overview 走 `ops_only`，未启用模块不出现在默认后台入口；动作按钮继续使用更细的 scope，例如 identity 写操作必须 `auth:manage`。

### P0-6 建立后台 API 模块化 client 与 envelope 解包边界（已完成）

- 状态回归：`app/services/api/**` 已建立 auth/admin client、admin envelope 解包工具、分页类型和任务派发 `payload_json: string` 建模；auth store 已消费 `createAuthClient()`，admin 模块 client 已把 `expectedKind/expectedOperationName` 传入解包，operation/kind/schema_version/detail 校验已接入模块主流程测试。
- 相关位置：`app/services/api/auth.ts`、`app/services/api/admin.ts`、`app/services/api/envelope.ts`、`tests/nuxt/admin-api.spec.ts`
- 根因：当前只有通用 `$fetch` 入口，没有后台管理接口的强类型模块边界。后端 admin 系列在外层 `ResponseEnvelope` 之外，很多接口的 `data` 还包含二层 `{ header, detail }`，并且列表协议同时存在 `offset-page` 与 `limit-feed` 两类。
- 影响：如果直接在页面里写 `$fetch<T>`，会把 envelope 解包、`kind/schema_version/operation_name` 校验、分页差异、命令返回快照、审计/日志边界散落到页面，后续维护成本高。
- 前置条件：先确认本轮要接的后端模块集。默认应优先接 `admin_identity` 与 `admin_audit`；task/settings/log/system/security 只有在后端启用对应模块并决定开放运维控制面时再进入导航和页面。
- 修复方案：建立 `authClient`、`adminEnvelopeClient` 与分模块 client：`adminIdentityScopeClient`、`adminIdentityRoleClient`、`adminIdentityBusinessRoleClient`、`adminIdentityUserClient`、`adminAuditClient`，运维模块再补 `adminTaskClient`、`adminSettingsReloadClient`、`adminLogClient`、`adminSecurityClient`、`systemOverviewClient`。模块 client 负责 query serializer、envelope parser、判别联合类型、命令返回快照适配；列表基座明确支持 `offset-page` 与 `limit-feed` 两种，不强行统一成单一分页表格。任务派发 payload 按后端 `payload_json: string` 建模，不在前端先拍平成任意对象。
- 遗漏项补充：已让 auth/session 主流程消费 `createAuthClient()`；已为 admin 模块 client 传入 operation/kind 期望值，并补 operation mismatch、kind mismatch、缺失 schema_version、缺失 detail、identity/audit 模块 operation 合约主流程测试。

### P0-7 明确并实现 SSR 可读的会话持久化/鉴权边界（已完成）

- 状态回归：已采用 SSR 可读 cookie/session 作为当前直连 Bearer 模式的会话来源；route middleware 在服务端与客户端读取同一会话边界，测试覆盖受保护路由首跳重定向、refresh 后重放和登出/匿名访问受保护路由。

- 相关位置：`app/stores/auth.ts`、`app/middleware/framework.global.ts`、`README.md`
- 根因：当前源码已建立浏览器侧 auth store，但会话持久化只落 `sessionStorage`；全局 route middleware 又会在 SSR/CSR 共同执行。SSR 首跳无法读取浏览器 `sessionStorage`，受保护后台路由会被服务端当成匿名用户处理。
- 影响：如果直接开启 `requiresAuth` 的后台页面，SSR 首屏鉴权与 CSR 会话状态不一致；若生产采用 Nuxt BFF/httpOnly cookie，这一层还没有真实落点。
- 前置条件：先确定生产鉴权形态是浏览器直连 Bearer，还是 Nuxt BFF/httpOnly same-site cookie。直连模式需要明确受保护后台页的 SSR 策略；BFF 模式需要明确 server 端 token/refresh token 持久化与转发边界。
- 修复方案：二选一收口：直连模式下让受保护后台页采用客户端初始化后的守卫策略并避免 SSR 误判；BFF 模式下实现 SSR 可读 cookie/session，并让 middleware 在服务端可读取同一会话来源。无论哪种，都要补首跳受保护路由、刷新后重放、登出后访问受保护路由的测试。

## P1：进入后台开发早期必须收口

### P1-1 统一请求错误、全局错误页和错误边界（已完成）

- 状态回归：请求错误 mapper、`app.vue` 运行时边界与 `error.vue` 已复用统一 display mapper，并支持 `requestId/traceId` 诊断复制和 4xx/5xx 分级恢复动作；相关主流程已进入测试覆盖。
- 相关位置：`app/utils/errors.ts:54`、`app/app.vue:3`、`app/error.vue:35`、`app/composables/useApi.ts:43`
- 根因：`useApi` 抛普通对象，`app.vue` 只识别 `Error`；`app/error.vue` 自己写展示映射，没有复用 `getDisplayError()`；所有错误都强制 `clearError({ redirect: '/' })`；也没有展示后端 envelope 里的 `request_id/trace_id`。
- 影响：404、422、503、鉴权错误在不同边界展示不一致，恢复动作也过于刚性；线上排障时用户无法复制请求标识。
- 前置条件：确定统一抛 `NuxtError` 还是自定义 `Error` 子类；确定哪些错误由 session 层消费，哪些进入页面错误边界。
- 修复方案：请求层统一抛 `createError()` 或稳定 `Error` 类型；`app.vue`、`app/error.vue`、请求错误展示都复用同一个 display mapper，并支持复制 `requestId/traceId`。鉴权分流建议：`auth.token.expired` 只触发 refresh；`auth.token.revoked`、`auth.token.reused`、refresh 阶段的 `auth.token.invalid` 硬登出；`auth.access.account_disabled` 进入禁用态；`auth.authorization.permission_denied` 展示 403；`auth.request.throttled` 与通用 429 限流分开提示。404 回首页，5xx/503/504 支持重试当前路由或返回上一页。

### P1-2 重新设计运行时错误采集和恢复路径（已完成）

- 状态回归：客户端插件已链回旧 handler，并将 Vue、`window error`、`unhandledrejection` 统一升级到错误页；服务端插件已链回 Nuxt 既有 handler，避免把已知 HTTP 错误二次改写成 500。Vue error handler、`window error`、`unhandledrejection`、server plugin 未知错误升级与已知 HTTP 错误保持稳定已补直接测试。
- 相关位置：`app/plugins/runtime-errors.client.ts`、`app/plugins/runtime-errors.server.ts`、`tests/nuxt/runtime-errors.spec.ts`、`tests/e2e/smoke.spec.ts`
- 根因：插件覆盖 `vueApp.config.errorHandler` 但不链回旧 handler；`window error` 和 `unhandledrejection` 只记录日志，不进入统一恢复路径；没有 server 侧同等入口。
- 影响：CSR 崩溃可能停在坏状态，SSR/CSR 故障表现不一致。
- 前置条件：定义哪些错误只记录，哪些错误升级到错误页。
- 修复方案：保留并调用旧 handler；对 fatal 未捕获错误统一 `showError(createError(...))` 或进入中心化恢复逻辑；如需要观测一致性，再补 server 插件或 Nitro error hook。
- 遗漏项补充：已补 runtime error 插件直接测试，覆盖旧 handler 链回、Vue 错误升级、`window error`、`unhandledrejection`、server 插件未知错误升级与已知 HTTP 错误不被改写。

### P1-3 修复 E2E 与 verify 的 build lock 竞争（已完成）

- 相关位置：`package.json:15`、`playwright.config.ts:7`、`playwright.config.ts:10`
- 根因：Playwright `fullyParallel: true` 且本地 worker 不限，`@nuxt/test-utils/playwright` 会并行构建/拉起多个 Nuxt 实例；`verify` 在 e2e 后立即 build，容易撞 Nuxt build lock。
- 影响：单项测试和构建可通过，但完整门禁不稳定，不能作为后台开发基线。
- 前置条件：确定 E2E 策略：单 Nuxt fixture 串行，还是共享 `webServer/baseURL` 并行。
- 修复方案：已关闭 `fullyParallel` 并固定 `workers: 1`；Playwright E2E 当前默认复用或启动 `http://127.0.0.1:3310`，CI 不复用未知本地服务，避免 Nuxt fixture 在 Windows 上重复生产构建并自动切换端口。

### P1-4 移动端侧栏改成完整模态导航（已完成）

- 状态回归：侧栏已完成 `inert/aria-hidden`、全局 Esc、首入焦点、关闭恢复和焦点循环；测试覆盖焦点恢复、焦点循环与移动端壳层可访问性。
- 相关位置：`app/components/layout/AppSidebar.vue:6`、`app/components/layout/AppSidebar.vue:86`、`app/components/layout/AppSidebar.vue:207`
- 根因：侧栏只做开关、遮罩和关闭态 `inert`；打开后没有接管焦点，没有让背景内容不可达，`Esc` 只在侧栏自身接到键盘事件时生效。
- 影响：移动端后台导航对键盘和读屏用户不稳定，焦点可能穿透到主内容。
- 前置条件：确认 `<=960px` 侧栏就是 modal navigation。
- 修复方案：打开时聚焦关闭按钮或首个导航项，关闭时恢复到菜单按钮；对主内容容器加 `inert/aria-hidden`；实现焦点循环和全局 Esc；补焦点恢复、焦点循环、Esc 的测试。

### P1-5 统一断点契约（已完成）

- 状态回归：TS 侧 `BREAKPOINTS` 与 `useBreakpoints()` 已作为断点契约来源；CSS/页面媒体查询已统一为 `md - 1` 与 `lg - 1` 对应值，并通过断点漂移测试防止旧断点回流。
- 相关位置：`app/assets/css/main.css:43`、`app/assets/css/main.css:225`、`app/composables/useBreakpoints.ts`、`app/components/layout/AppHeader.vue:174`、`app/components/layout/PageContainer.vue:104`、`app/pages/index.vue:275`
- 根因：CSS token 是 `640/768/1024/1280`，实际媒体查询还有 `560/680/720/960/1080`，TS composable 又是另一套。
- 影响：后台表格、筛选栏、详情抽屉、侧栏会在不同宽度各自塌陷。
- 前置条件：先定一套后台壳层与数据页面的标准断点。
- 修复方案：抽出单一 breakpoint source，CSS media query 与 `useBreakpoints()` 共用；清理未消费的旧断点。

### P1-6 SSR 主题首屏避免闪烁（已完成）

- 状态回归：head 内联 theme bootstrap 与 `html[data-theme]` 初值读取已实现；测试覆盖 hydration 前主题脚本、store 初值读取，以及阻断 Nuxt client bundle 后仍能在 hydration 前应用本地存储主题，降低 SSR 首屏闪烁风险。
- 相关位置：`app/composables/useTheme.ts:15`、`app/composables/useTheme.ts:44`、`app/assets/css/main.css:49`
- 根因：服务端固定回退 `light`，`data-theme` 在 mounted 后才写入。
- 影响：深色偏好用户会看到浅色首屏闪烁，后台密集页面尤其明显。
- 前置条件：确定主题来源：cookie、server hint，或 head 内联脚本。
- 修复方案：在 hydration 前写入 `html[data-theme]`，并让 store 初值与 HTML 属性一致；补 theme bootstrap 测试。

## P2：维护性与规范补强

### P2-1 测试目录和覆盖率门槛需要正式化（已完成）

- 状态回归：`tests/nuxt` 已写入正式规格，`vitest.config.ts` 已加入 Nuxt 运行时测试入口、关键基础设施 coverage include 与覆盖率门槛；`pnpm test:coverage` 已通过，并已接入默认 `pnpm verify` 与 `pnpm release:check` 主门禁，README 命令清单也已列出覆盖率和发布检查命令。
- 相关位置：`docs/nuxt应用骨架规格.md:76`、`vitest.config.ts:7`、`vitest.config.ts:18`、`package.json`、`README.md`、`tests/unit/delivery.test.ts`
- 根因：规格只写 `tests/unit` 和 `tests/e2e`，实际还有 `tests/nuxt`；Vitest 没有 coverage threshold。
- 影响：后续团队会不清楚组件/运行时测试应放哪里，也无法保证 auth、middleware、API client 被门禁覆盖。
- 前置条件：决定 `tests/nuxt` 是正式第三类测试，还是并回 `tests/unit`。
- 修复方案：建议保留 `tests/nuxt` 并更新规格文档；给关键模块设置覆盖率或关键文件必测清单，把 auth store、route middleware、API client、error mapper、layout shell 纳入门禁。
- 遗漏项补充：已把 `pnpm test:coverage` 接入 `pnpm verify`，并在 README 命令清单补充覆盖率与 release gate 命令。

### P2-2 部署入口、API 运行配置和 README 需要统一（已完成）

- 相关位置：`package.json:10`、`nuxt.config.ts` 的 `nitro.preset: 'node-server'`、`README.md`
- 根因：脚本保留 `nuxt generate`，配置又明确 `node-server`，README 没把 `verify/typecheck/build`、`apiBaseURL`、直连/BFF 策略、前端公开访问 origin 作为标准交付流程说明清楚。
- 影响：接入鉴权和 SSR 后，容易被误按静态产物发布；直连跨域时 refresh token 会落在浏览器侧。CORS 放行本身由后端或网关负责，前端不实现 CORS，但前端必须明确自己的访问域名、端口和 API baseURL，否则后端/网关无法稳定配置允许源。
- 前置条件：确定后台只支持 SSR Node，还是保留静态双模；确定生产是前端直连 API，还是同源反代/Nuxt server proxy/BFF。后端 Docker 内应用是 `uvicorn :8000` 明文 HTTP，对外 TLS、Host、真实客户端 IP 应由网关/反代边界处理。
- 修复方案：如果后台走 SSR Node，删除或弱化 `generate`，README 明确 `pnpm verify`、`pnpm typecheck`、`pnpm build`、`NUXT_PUBLIC_API_BASE_URL` 或等价 runtime config。生产推荐同源反代或 Nuxt BFF；若直连 API，前端文档只记录前端正式 origin 与 API baseURL，交由后端/网关配置允许源，并明确 refresh token 浏览器存储策略。反向代理部署还要由后端/网关解决 `X-Forwarded-*` / 真实客户端 IP 传递，否则后端限流、IP 封禁、token binding 会只看到网关 IP。如果保留静态双模，拆成 `build:ssr` / `build:static` 并补测试矩阵。

### P2-3 清理过时/易误导的错误字段和 404 写法（已完成）

- 相关位置：`app/pages/[...slug].vue:12`
- 根因：404 用 `statusMessage: '页面未找到'` 承载展示文案，运行时已提示长错误信息应使用 `message`，未来 `statusMessage` 可能被 sanitize。
- 影响：后续错误展示可能丢文案，且模板内容实际不可达，维护者容易误判。
- 前置条件：先统一错误展示模型。
- 修复方案：404 使用稳定 `message` 字段，`statusMessage` 保持短状态语义；不可达模板可清理或改成更明确的 throw-only 页面。

### P2-4 链接焦点和 Alert 语义补强（已完成）

- 状态回归：全局正文链接 affordance、统一 `:focus-visible` 和 `danger` alert 的 `role="alert"` 已落地；Alert 语义已有组件测试，链接 underline/focus-visible 也已补静态断言。
- 相关位置：`app/assets/css/main.css` 的全局 `a` reset、`app/components/layout/AppHeader.vue`、`app/components/layout/AppSidebar.vue`、`app/components/feedback/AppAlert.vue:2`、`tests/nuxt/feedback-components.spec.ts`、`tests/unit/delivery.test.ts`
- 根因：全局链接去掉下划线，导航链接缺少明确 `:focus-visible`；`AppAlert` 不区分严重度，全部 `role="status"`。
- 影响：后台正文链接可发现性弱，键盘焦点不明显，危险/权限错误播报不够强。
- 前置条件：定义正文链接、导航链接、危险反馈的视觉和 aria 规范。
- 修复方案：恢复正文链接 affordance 或引入 `.text-link` / `.nav-link` 分层；给 header/sidebar 链接加统一 focus ring；`danger` alert 映射为 `role="alert"` 或暴露 `role/aria-live` props。
- 遗漏项补充：已补链接样式直接测试，静态断言全局 `a` underline 与 `a:focus-visible` outline。

### P2-5 实验性依赖进入发布前决策（已完成）

- 相关位置：`package.json:33`
- 根因：`@nuxt/a11y` 使用 `1.0.0-alpha.1`。
- 影响：短期不阻断，但会增加 CI 噪音和升级风险。
- 前置条件：确认当前里程碑是否必须默认启用 a11y 模块。
- 修复方案：有稳定版则升级到稳定版；没有稳定版则把实验性模块从默认骨架移出，或在 README 明确其 alpha 风险。

## 已经达标的部分

- Nuxt 4 + TypeScript + Pinia + Tailwind + Vitest + Playwright 基线已具备。
- `nuxt.config.ts` 集中管理 SSR、模块、runtime config、CSS、auto import、alias、routeRules、Nitro。
- `app/` 目录符合 Nuxt 4 应用主目录心智模型。
- `layouts/default/empty/error` 齐全，布局未写具体后台业务页面判断，但已接入导航权限过滤入口。
- 基础组件、反馈组件整体无业务语义，布局组件保留后台接入所需的导航过滤与壳层能力。
- 请求层已有 baseURL、timeout、token 注入、错误归一化、`skipAuth`、显式 public auth 策略、auth public endpoint 白名单与 refresh retry 的基础入口。
- 页面级错误、404、运行时客户端/服务端错误入口已具备直接测试覆盖。
- 当前已具备首批后台业务页面、认证、RBAC 与后台 API client 闭环，可作为后续后台模块扩展的稳定开发基线。

## 本次已补充遗漏项

- P0-1：已补 `auth.token.revoked/reused/invalid`、`auth.access.account_disabled`、`auth.request.throttled` 等状态分流测试。
- P0-2：已补 `guestOnly/redirectTo` route middleware 测试。
- P0-3：已补 API client 内置 auth public endpoint 白名单和显式 public 策略，并测试未显式 `skipAuth` 时 `/auth/*` 与公共请求不自动带 token。
- P0-4：已补真实 `$fetch` 失败后 `onError` 二次抛错仍保留原始 API error 的精确测试，并补 envelope 403/429 分类测试。
- P0-6：已补 auth store 消费 `createAuthClient()`、admin 模块 client operation/kind 期望值传递、operation mismatch、kind mismatch、缺失 schema_version、缺失 detail 与 identity/audit 模块 operation 合约测试。
- P0-7：已补 logout/revoke 失败、本地登出后访问受保护路由的测试。
- P1-1：已补 `app.vue` 运行时错误边界中复制 `requestId/traceId` 与 5xx 重试动作的直接断言。
- P1-2：已补 runtime error 插件直接测试，覆盖客户端三类错误入口与服务端未知错误升级。
- P1-6：已补阻断 Nuxt client bundle 后仍应用本地存储主题的 hydration 前 E2E 断言。
- P2-1：已补 `pnpm test:coverage` 接入 `pnpm verify` 和 `pnpm release:check` 的主门禁说明。
- P2-4：已补链接 underline / focus-visible 的静态测试。
- P2-5：已补 `@nuxt/a11y` alpha 依赖发布前决策的 README release checklist 与自动化断言。

## 建议执行顺序

1. 以后端已确认的 `Bearer access token + JSON refresh token rotation + admin role + route scope` 为基准，先定前端采用直连 API 还是 Nuxt BFF。
2. P0-1 到 P0-7 均已完成，可继续沿用统一 auth/session、route meta、RBAC 导航模型、auth-aware API client、后台模块 client 与 SSR 会话边界。
3. P1-1 到 P1-6 均已完成，可作为错误链路、壳层交互、响应式和主题首屏契约基线。
4. P2-1 到 P2-5 均已完成，coverage/release gate、部署说明、错误字段、链接焦点与 alpha 依赖发布决策均已纳入文档或测试。
5. P1-4 到 P1-6 已完成，后台首批页面接入时继续复用现有壳层交互、响应式和主题首屏契约。
