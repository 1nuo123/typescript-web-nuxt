# Nuxt 应用骨架规格

## 2026-07-05 追加复核修正

- 当前 `pnpm release:check`：已通过；本轮最终收口在未发现 Docker Compose 配置、3310 端口未被监听的本地项目环境中重跑通过。
- 当前通过项：`pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test -- --run`、`pnpm test:coverage`、`pnpm build` 与 `pnpm test:e2e` 均已通过；Vitest 18 个文件、95 个测试通过，E2E 6 个 Chromium 冒烟测试通过，coverage 总体为 statements 87.75%、branches 80.8%、functions 89.65%、lines 87.44%。
- 当前 E2E/release gate 边界：`pnpm test:e2e` 已通过；后续发布仍必须在目标环境重新执行 `pnpm release:check` 并以当次输出为准。
- 当前后端接口文档边界：已尝试访问 `http://127.0.0.1:8000/docs` 与 `/openapi.json`，本地连接失败；后端真实契约仍需在后端环境可用时单独验证。
- 当前 CI 与 Git 边界：未发现 `.github/workflows`，CI 不复用未知本地服务仅由 Playwright 配置语义支撑；当前目录不是 Git 仓库，无法绑定 commit。
- 当前文档可读性边界：本文已按 UTF-8 可读性复核，并纳入 `tests/unit/delivery.test.ts` 的交付文档防回退检查；本追加复核修正块优先于下方历史测试结果记录。

本文定义当前 Nuxt 前端项目的工程、架构、目录、质量与交付规格。若本文早期骨架描述与当前源码冲突，以当前源码、已冻结后端契约和任务清单为准。

## 一、技术基线

- 框架：Nuxt 4，使用 `app/` 目录模型。
- 语言：TypeScript。
- UI：Vue 3 Composition API。
- 包管理器：pnpm。
- 渲染模式：默认 SSR Node 交付。
- 样式：Tailwind CSS 入口与 `app/assets/css/main.css` 设计变量。
- 状态管理：Pinia，仅承载应用级共享状态。
- 测试：Vitest、Nuxt runtime tests、Playwright。
- 代码规范：ESLint、Prettier。
- 构建目标：现代浏览器与 Nitro `node-server`。

Nuxt 4 官方目录规范以 `app/` 作为应用主目录，`nuxt.config.ts` 作为主配置入口；参考 Nuxt 官方文档：`https://nuxt.com/docs/4.x/directory-structure`。

## 二、项目目标

- 提供稳定的 Nuxt 应用基础结构。
- 统一目录、路由、布局、样式、状态、请求、错误处理与测试规范。
- 支持后续业务模块按契约接入。
- 保证开发、测试、构建、交付流程可复验。
- 基础骨架阶段不内置业务领域模型；当前项目已在后台管理接入边界中记录首批后台页面、强类型契约与 RBAC 边界。

## 三、推荐目录

```text
project-root/
  app/
    app.vue
    app.config.ts
    assets/
    components/
      base/
      layout/
      feedback/
    composables/
    layouts/
    middleware/
    pages/
    plugins/
    stores/
    types/
    utils/
  public/
  tests/
    unit/
    nuxt/
    e2e/
  nuxt.config.ts
  package.json
  tsconfig.json
  eslint.config.*
  playwright.config.*
  vitest.config.*
```

目录职责：

- `app/app.vue`：应用根入口，只放全局布局挂载、页面出口与全局错误边界。
- `app/app.config.ts`：应用级静态配置入口。
- `app/pages/`：文件路由目录，页面文件只承载页面级组合。
- `app/layouts/`：布局目录，例如 `default`、`empty`、`error`。
- `app/components/base/`：无业务基础组件，例如按钮、输入框、弹窗、加载状态。
- `app/components/layout/`：应用壳组件，例如顶部栏、侧边栏、页面容器。
- `app/components/feedback/`：反馈类组件，例如 Alert、Skeleton、EmptyState。
- `app/composables/`：通用组合逻辑，例如请求封装、主题、断点、存储。
- `app/stores/`：全局状态，仅存放应用级状态、会话占位和非业务缓存。
- `app/middleware/`：路由中间件与框架级守卫。
- `app/plugins/`：运行时插件和第三方库初始化。
- `app/types/`：全局 TypeScript 类型、公共契约与枚举。
- `app/utils/`：纯工具与公共 registry。
- `tests/unit/`：纯函数、工具和非 Nuxt 运行时单元测试。
- `tests/nuxt/`：依赖 Nuxt app、自动导入、组件挂载、store、middleware 的运行时测试。
- `tests/e2e/`：端到端冒烟测试。

## 四、配置规范

`nuxt.config.ts` 统一管理模块注册、SSR 开关、Runtime Config、CSS 入口、构建优化、DevTools、alias 与 Nitro 预设。

配置原则：

- 环境变量只通过 Runtime Config 暴露。
- 客户端可访问变量必须放在 `runtimeConfig.public`。
- 页面或组件不得直接读取原始环境变量。
- API baseURL、timeout、应用名称等稳定配置必须集中为常量或 runtime config。
- 生产环境必须显式配置 `NUXT_PUBLIC_API_BASE_URL`。

## 五、模块规范

基础必选模块：

- Nuxt ESLint：代码规范。
- Pinia：全局状态管理。
- Vitest 与 Playwright：单元、运行时与 E2E 测试。
- Tailwind CSS：基础样式与设计变量。

可选模块只在明确需求出现时启用，例如 i18n、image、color-mode。`@nuxt/a11y` 当前作为 alpha 依赖用于开发反馈，生产发布前必须重新评估稳定性或记录保留决策。

## 六、请求与契约规范

请求层必须提供：

- 统一 baseURL 与请求超时。
- 请求目标可信度校验。
- Token 注入边界。
- 错误归一化。
- 响应 envelope 解析。
- SSR 与 CSR 兼容。
- 全局错误处理扩展点。

禁止：

- 页面中散落 `$fetch`。
- 组件中拼接业务接口路径。
- 请求层绕过统一 envelope parser。
- 使用未收敛的固定 route、operation、kind、schema version 或 scope 字符串。

契约统一采用“公共头字段 + 强类型扩展字段”模式。外层统一使用 `ResponseEnvelope.header + ResponseEnvelope.data`；admin 模块在 `data` 内继续使用 `header + detail`，其中 `header` 校验 `kind/schema_version/operation_name`，`detail` 使用模块强类型字段。

## 七、路由与布局规范

路由原则：

- 使用 Nuxt 文件路由。
- route meta 承载布局、认证、权限、运行时开关和页面标题。
- 后台管理入口统一由 Admin Route Registry 收敛。
- 新增 `app/pages/admin/**/*.vue` 页面必须同步注册到 registry；`tests/nuxt/admin-pages.spec.ts` 会递归扫描真实页面并校验 registry 与页面 meta 一致性。
- `/admin` 与 `/admin/**` 均由路由守卫兜底保护。

布局原则：

- `default`：标准应用布局。
- `auth`：独立认证页面布局。
- `public`：公共页面布局。
- `empty`：无导航布局。
- `error`：错误页布局。
- 布局不得写入具体业务判断。

## 八、状态与鉴权规范

Pinia store 只允许保存：

- 应用配置状态。
- 用户界面状态。
- 会话状态。
- 非业务缓存状态。

鉴权边界：

- Admin Boundary 永远按 `PermissionMode.All` 独立校验。
- 页面自定义角色和 scope 再按页面声明的 `permissionMode` 校验。
- Refresh 状态机必须通过 refresh lock、`skipRefresh`、access token 存在校验与 `sessionVersion` 失效保护避免重放。
- 生产 refresh token 持久化优先采用 Nuxt BFF 或后端 httpOnly same-site session；若短期采用浏览器直连 Bearer 模式，必须显式接受 refresh token 可被 XSS 读取的风险，并通过更短生命周期、最小化作用域与 CSP 等措施降低暴露面。

## 九、后台管理接入边界

当前后台页面边界：

- `/`：首页空白占位，不承载后台管理功能。
- `/login`：通用登录页，使用独立 `auth` 布局和 `guestOnly` 边界。
- `/register`：注册状态页，当前仅展示“注册暂未开放”。
- `/admin`：中性后台总览，只展示当前主体可见模块入口。
- `/admin/identity/**`：业务后台身份管理页面，按 `admin + auth:read/auth:manage` 裁剪。
- `/admin/audit`：业务审计页面，按 `admin + auth:read` 裁剪。
- `/admin/ops/**`：运维控制面页面，按 `admin + system:read/task:dispatch/security:manage` 裁剪，并受 `NUXT_PUBLIC_ADMIN_OPS_ENABLED` 运行时开关控制。

Admin Route Registry 当前由 `app/utils/admin-routes.ts` 集中维护，导航、总览页和模块页消费同一 registry。

## 十、测试规范

最低测试范围：

- 基础组件单元测试。
- composable 单元测试。
- 请求层和 envelope 测试。
- auth/session/RBAC 测试。
- route middleware 测试。
- runtime error 测试。
- Admin 页面 registry 与权限边界测试。
- 首屏与关键路由 E2E 冒烟测试。
- 生产构建测试。

质量门禁：

- TypeScript 类型检查通过。
- ESLint 通过。
- Prettier 检查通过。
- Vitest 单元与 Nuxt runtime 测试通过。
- Coverage 门禁通过。
- Playwright E2E 冒烟测试通过。
- 生产构建通过。

## 十一、交付规范

本项目默认采用 SSR Node 交付，通过 Nuxt/Nitro `node-server` 构建。静态生成不是当前后台管理交付路径。

前端记录 public origin 与 API baseURL，CORS allow-list、TLS 终止、真实客户端 IP 透传和后端 OpenAPI 暴露由后端或网关层配置。

Playwright E2E 默认目标为 `http://127.0.0.1:3310`；本地允许复用已有服务，CI 使用 `reuseExistingServer: false`，端口冲突直接失败。需要指向其他部署环境时设置 `NUXT_TEST_HOST`。

当前仓库未提供 `.github/workflows`；CI 不复用未知本地服务仅由 `playwright.config.ts` 在 `CI` 环境变量下支撑，尚未由真实 CI 流水线验证。

## 十二、当前真实测试结果

可复验边界：以下记录来自 2026-07-05 本地 Windows/PowerShell 项目环境；前端项目目录未发现 Docker Compose 配置，已按本地项目环境执行。当前目录不是 Git 仓库，无法把通过记录绑定到 commit；后续发布仍必须重新执行 `pnpm release:check` 并以当次命令输出为准。

- Docker Compose：当前前端目录未发现 `docker-compose.yml`、`docker-compose.yaml`、`compose.yml` 或 `compose.yaml`，已使用本地项目环境。
- Playwright 浏览器依赖：首次完整回归因本机缺少 Chromium headless shell 失败，已执行 `pnpm exec playwright install chromium` 后重跑。
- `pnpm format:check`：通过。
- `pnpm lint`：通过。
- `pnpm typecheck`：通过。
- `pnpm test -- --run`：通过，18 个测试文件、95 个测试。
- `pnpm test:coverage`：通过，statements 87.75%、branches 80.8%、functions 89.65%、lines 87.44%。
- `pnpm build`：通过；仍存在 Nuxt/Tailwind sourcemap 与 Node 依赖弃用警告，不阻断发布门禁。
- `pnpm test:e2e`：通过，6 个 Chromium 冒烟测试。
- `pnpm release:check`：本轮最终收口已通过，覆盖格式化、lint、类型检查、Vitest、coverage、生产构建与 Playwright E2E。

后端联调：开发默认 `NUXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000`；生产环境仍必须显式配置 API baseURL。
