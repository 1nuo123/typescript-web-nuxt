# Nuxt Application Skeleton

Nuxt 4 + TypeScript application skeleton focused on framework structure, backend-admin auth boundaries, and release-quality checks.

## Stack

- Nuxt 4 with the `app/` directory
- Vue 3 Composition API
- Pinia for application-level shared state
- Tailwind CSS entry plus design tokens in `app/assets/css/main.css`
- ESLint, Prettier, Vitest, and Playwright

## Structure

```text
app/
  assets/css/
  components/base/
  components/layout/
  components/feedback/
  composables/
  layouts/
  middleware/
  pages/
  plugins/
  stores/
  types/
  utils/
tests/
  unit/
  nuxt/
  e2e/
```

The skeleton intentionally keeps domain logic out of generic framework layers. It does include the backend-admin auth, permission, route registry, and API client boundaries needed before business pages are attached.

## Commands

```bash
pnpm dev
pnpm build
pnpm build:ssr
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm verify
pnpm release:check
```

Playwright E2E uses isolated `http://127.0.0.1:3320` and never reuses an unknown server. Set `NUXT_TEST_HOST` only to test an explicitly selected deployed environment.

当前仓库未提供 `.github/workflows` 流水线；CI 行为仅由 `playwright.config.ts` 在 `CI` 环境变量下控制。接入流水线时仍需执行 `pnpm release:check`。

## Runtime Config

Client-visible values belong under `runtimeConfig.public` in `nuxt.config.ts`. The request layer reads `apiBaseURL` and `apiTimeout` from runtime config and keeps token injection/error handling as extension points.

For direct browser-to-API deployments, set the public API base URL:

```bash
NUXT_API_BASE_URL=http://127.0.0.1:8000
NUXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
NUXT_PUBLIC_API_TIMEOUT=10000
```

Development falls back to `http://127.0.0.1:8000`, which matches the sibling FastAPI backend compose environment. Docker runs should set `NUXT_API_BASE_URL=http://host.docker.internal:8000` and `NUXT_PUBLIC_API_BASE_URL=/api`, so browser REST calls stay same-origin through the Nuxt server proxy and the HttpOnly refresh cookie is issued for the page origin with the public `/api/auth/browser` cookie path. Local Codex WebSocket traffic may still set `NUXT_PUBLIC_CODEX_WS_BASE_URL=http://127.0.0.1:8000`; production should proxy REST under `/api` and WebSockets at the HTTPS gateway. `NUXT_PUBLIC_API_TIMEOUT` accepts milliseconds; invalid or missing values fall back to the default request timeout.

Admin ops pages are hidden and guarded by default because the standard backend compose environment only mounts business admin routes. Enable them only when the backend ops routes are mounted:

```bash
NUXT_PUBLIC_ADMIN_OPS_ENABLED=true
```

Codex Remote 页面同样采用显式功能开关。生产环境从 API origin 推导 WSS
地址；仅在前后端分离的本地开发环境配置明确的 WebSocket base URL：

```bash
NUXT_PUBLIC_CODEX_FEATURE_ENABLED=true
NUXT_PUBLIC_CODEX_REALTIME_PATH=/codex/events
NUXT_PUBLIC_CODEX_WS_BASE_URL=ws://127.0.0.1:8000
```

浏览器实时连接只把一次性 ticket 放入查询参数，不会把 access token、
refresh token 或本机路径写入 URL。后端 Codex realtime ticket 与 event
endpoint 未启用时必须保持功能开关关闭。

本地 Docker 启动前端时必须在本目录执行 `docker compose up -d`。Compose
服务已声明 `pull_policy: build`，会在启动前按当前源码重建镜像，避免浏览器
仍加载旧的实时事件 schema。若页面仍显示 schema 不兼容，请先关闭旧标签页、
执行一次强制刷新，再确认容器状态为 healthy。

Production should place Nuxt and FastAPI behind one HTTPS gateway origin. The backend browser login/refresh endpoints keep the refresh token in a Secure, httpOnly, SameSite cookie; Nuxt stores only the short-lived access token in memory and never reads the refresh token. Use a single public REST namespace such as `NUXT_PUBLIC_API_BASE_URL=/api` so browser cookie paths match the request path; production WSS should be derived from or proxied at the same HTTPS gateway.

For the temporary `http://47.113.177.140` server acceptance environment, clone
this repository beside `python-web-fastapi` and run the backend repository's
`deploy/prepare-production-env.sh` and `deploy/run-production-ip.sh` scripts.
The scripts generate this repository's untracked `.env.production.local`,
attach Nuxt to `fastapi-web-production-edge`, and keep browser API requests on
the same-origin `/api` namespace. Persistent login refresh and Windows Agent
WSS still require the later HTTPS domain acceptance.

## Delivery

This skeleton targets SSR Node delivery through Nuxt/Nitro `node-server`. Static generation is not part of the default backend-admin delivery path.

The frontend records its public origin and API base URL for deployment coordination. CORS allow-lists, TLS termination, forwarded client IP headers, and backend OpenAPI exposure are configured by the backend or gateway layer.

`@nuxt/a11y` is currently kept as an alpha dependency for development feedback. Re-evaluate it before a production release window if a stable version is not available.

## Release Checklist

Run `pnpm release:check` before a production release. If `@nuxt/a11y` remains on an alpha version, record the release decision explicitly or remove the module from the default production build before shipping.
