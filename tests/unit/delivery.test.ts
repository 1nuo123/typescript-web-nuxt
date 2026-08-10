import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_API_TIMEOUT_MS,
  parseRuntimeApiTimeout,
} from '../../app/types/api'
import { DEFAULT_APP_NAME } from '../../app/types/app'

const PACKAGE_JSON_PATH = fileURLToPath(
  new URL('../../package.json', import.meta.url),
)
const README_PATH = fileURLToPath(new URL('../../README.md', import.meta.url))
const NUXT_SPEC_PATH = fileURLToPath(
  new URL('../../docs/nuxt应用骨架规格.md', import.meta.url),
)
const TASK_PLAN_PATH = fileURLToPath(
  new URL(
    '../../docs/2026-07-02_Nuxt统一心智模型代码审查修复清单.md',
    import.meta.url,
  ),
)
const BACKEND_EXECUTION_PLAN_PATH = fileURLToPath(
  new URL(
    '../../docs/2026_6_6_1411_后端接口对照前端页面闭环执行方案.md',
    import.meta.url,
  ),
)
const ADMIN_REVIEW_PLAN_PATH = fileURLToPath(
  new URL('../../docs/后台管理接入前Nuxt骨架审查修复清单.md', import.meta.url),
)
const MAIN_CSS_PATH = fileURLToPath(
  new URL('../../app/assets/css/main.css', import.meta.url),
)
const VITEST_CONFIG_PATH = fileURLToPath(
  new URL('../../vitest.config.ts', import.meta.url),
)
const PLAYWRIGHT_CONFIG_PATH = fileURLToPath(
  new URL('../../playwright.config.ts', import.meta.url),
)
const NUXT_CONFIG_PATH = fileURLToPath(
  new URL('../../nuxt.config.ts', import.meta.url),
)
const COMPOSE_PATH = fileURLToPath(
  new URL('../../compose.yml', import.meta.url),
)
const API_TYPES_PATH = fileURLToPath(
  new URL('../../app/types/api.ts', import.meta.url),
)
const APP_HEADER_PATH = fileURLToPath(
  new URL('../../app/components/layout/AppHeader.vue', import.meta.url),
)
const DEFAULT_LAYOUT_PATH = fileURLToPath(
  new URL('../../app/layouts/default.vue', import.meta.url),
)
const APP_ROOT_PATH = fileURLToPath(
  new URL('../../app/app.vue', import.meta.url),
)
const TEST_COVERAGE_COMMAND = 'pnpm test:coverage'
const RELEASE_CHECK_COMMAND = 'pnpm release:check'
const VERIFY_SCRIPT_NAME = 'verify'
const RELEASE_CHECK_SCRIPT_NAME = 'release:check'
const RUNTIME_ERRORS_CLIENT_COVERAGE_PATH =
  'app/plugins/runtime-errors.client.ts'
const RUNTIME_ERRORS_SERVER_COVERAGE_PATH =
  'app/plugins/runtime-errors.server.ts'
const CLIENT_LOGGER_COVERAGE_PATTERN = 'app/composables/useClientLogger.ts'
const E2E_SERVER_ISOLATION_RULE = 'reuseExistingServer: false'
const E2E_IGNORE_LOCK_RULE = "NUXT_IGNORE_LOCK: '1'"
const E2E_DEV_SERVER_HOST_RULE = "const E2E_DEV_SERVER_HOST = '127.0.0.1'"
const E2E_DEV_SERVER_PORT_RULE = 'const E2E_DEV_SERVER_PORT = 3320'
const E2E_DEFAULT_BASE_URL = 'http://127.0.0.1:3320'
const E2E_HOST_ENV_NAME = 'NUXT_TEST_HOST'
const E2E_ISOLATION_DESCRIPTION = 'E2E 使用独立端口且不复用未知服务'
const E2E_ISOLATION_DESCRIPTION_ASCII =
  'Playwright E2E uses isolated `http://127.0.0.1:3320` and never reuses an unknown server.'
const E2E_CI_REUSE_DESCRIPTION = 'CI 使用 `reuseExistingServer: false`'
const GITHUB_WORKFLOW_DIRECTORY = '.github/workflows'
const COMPOSE_BUILD_PULL_POLICY = 'pull_policy: build'
const NUXT_APP_NAME_CONFIG_RULE = 'appName: DEFAULT_APP_NAME'
const SESSION_AWARE_CLIENT_ROUTE_RULES = [
  "'/': { ssr: false }",
  "'/login': { ssr: false }",
  "'/register': { ssr: false }",
  "'/account': { ssr: false }",
  "'/account/**': { ssr: false }",
  "'/admin': { ssr: false }",
  "'/admin/**': { ssr: false }",
  "'/codex': { ssr: false }",
  "'/codex/**': { ssr: false }",
] as const
const EXPECTED_DEFAULT_APP_NAME = '\u5e94\u7528\u9aa8\u67b6'
const API_TIMEOUT_ENV_NAME = 'NUXT_PUBLIC_API_TIMEOUT'
const INVALID_API_TIMEOUT_ENV_VALUE = 'not-a-number'
const BELOW_MIN_API_TIMEOUT_MS = 0
const VALID_API_TIMEOUT_MS = 2500
const LINK_SELECTOR = 'a {'
const LINK_UNDERLINE_RULE = 'text-decoration: underline;'
const FOCUS_VISIBLE_SELECTOR = 'a:focus-visible'
const FOCUS_OUTLINE_RULE = 'outline: 3px solid'
const READABLE_TEXT_FILE_PATHS = [
  README_PATH,
  NUXT_SPEC_PATH,
  TASK_PLAN_PATH,
  BACKEND_EXECUTION_PLAN_PATH,
  ADMIN_REVIEW_PLAN_PATH,
  NUXT_CONFIG_PATH,
  API_TYPES_PATH,
  APP_HEADER_PATH,
  DEFAULT_LAYOUT_PATH,
  APP_ROOT_PATH,
] as const
const MOJIBAKE_SENTINELS = [
  '姒涙',
  '鎼存梻',
  '閸欐ぞ',
  '閻ц',
  '娑撳',
  '鐠哄疇',
  '闁偓',
  '妤犮劍',
  '榛樿',
  '浣跨敤',
  'mojibake',
  '不能证明全文可读',
  '仍存在中文 mojibake',
] as const

describe('delivery and style gates', () => {
  it('keeps coverage in the main verify and release gates', () => {
    const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as {
      scripts: Record<string, string>
    }
    const readme = readFileSync(README_PATH, 'utf8')

    expect(packageJson.scripts[VERIFY_SCRIPT_NAME]).toContain(
      TEST_COVERAGE_COMMAND,
    )
    expect(packageJson.scripts[RELEASE_CHECK_SCRIPT_NAME]).toContain(
      VERIFY_SCRIPT_NAME,
    )
    expect(readme).toContain(TEST_COVERAGE_COMMAND)
    expect(readme).toContain(RELEASE_CHECK_COMMAND)
    expect(readme).toContain('@nuxt/a11y')
  })

  it('keeps runtime errors, e2e server isolation, and timeout config auditable', () => {
    const vitestConfig = readFileSync(VITEST_CONFIG_PATH, 'utf8')
    const playwrightConfig = readFileSync(PLAYWRIGHT_CONFIG_PATH, 'utf8')
    const readme = readFileSync(README_PATH, 'utf8')

    expect(vitestConfig).toContain(RUNTIME_ERRORS_CLIENT_COVERAGE_PATH)
    expect(vitestConfig).toContain(RUNTIME_ERRORS_SERVER_COVERAGE_PATH)
    expect(vitestConfig).toContain(CLIENT_LOGGER_COVERAGE_PATTERN)
    expect(playwrightConfig).toContain(E2E_SERVER_ISOLATION_RULE)
    expect(playwrightConfig).toContain(E2E_IGNORE_LOCK_RULE)
    expect(playwrightConfig).toContain(E2E_DEV_SERVER_HOST_RULE)
    expect(playwrightConfig).toContain(E2E_DEV_SERVER_PORT_RULE)
    expect(E2E_ISOLATION_DESCRIPTION).not.toBe(E2E_CI_REUSE_DESCRIPTION)
    expect(readme).toContain(API_TIMEOUT_ENV_NAME)
    expect(readme).toContain(E2E_DEFAULT_BASE_URL)
    expect(readme).toContain(E2E_HOST_ENV_NAME)
    expect(readme).toContain(E2E_ISOLATION_DESCRIPTION_ASCII)
    expect(readme).toContain(GITHUB_WORKFLOW_DIRECTORY)
    expect(readme).toContain('httpOnly')
  })

  it('keeps release-facing Chinese copy readable', () => {
    for (const filePath of READABLE_TEXT_FILE_PATHS) {
      const fileContent = readFileSync(filePath, 'utf8')

      for (const sentinel of MOJIBAKE_SENTINELS) {
        expect(fileContent).not.toContain(sentinel)
      }
    }

    expect(readFileSync(NUXT_CONFIG_PATH, 'utf8')).toContain(
      NUXT_APP_NAME_CONFIG_RULE,
    )
    expect(DEFAULT_APP_NAME).toBe(EXPECTED_DEFAULT_APP_NAME)
  })

  it('rebuilds the local Docker image before starting the frontend', () => {
    const compose = readFileSync(COMPOSE_PATH, 'utf8')

    expect(compose).toContain(COMPOSE_BUILD_PULL_POLICY)
  })

  it('keeps runtime API timeout fallback deterministic', () => {
    expect(parseRuntimeApiTimeout(INVALID_API_TIMEOUT_ENV_VALUE)).toBe(
      DEFAULT_API_TIMEOUT_MS,
    )
    expect(parseRuntimeApiTimeout(BELOW_MIN_API_TIMEOUT_MS)).toBe(
      DEFAULT_API_TIMEOUT_MS,
    )
    expect(parseRuntimeApiTimeout(VALID_API_TIMEOUT_MS)).toBe(
      VALID_API_TIMEOUT_MS,
    )
  })

  it('keeps session-aware routes out of the SSR credential boundary', () => {
    const nuxtConfig = readFileSync(NUXT_CONFIG_PATH, 'utf8')

    for (const routeRule of SESSION_AWARE_CLIENT_ROUTE_RULES) {
      expect(nuxtConfig).toContain(routeRule)
    }
  })

  it('keeps link affordance and focus styles explicit', () => {
    const css = readFileSync(MAIN_CSS_PATH, 'utf8')

    expect(css).toContain(LINK_SELECTOR)
    expect(css).toContain(LINK_UNDERLINE_RULE)
    expect(css).toContain(FOCUS_VISIBLE_SELECTOR)
    expect(css).toContain(FOCUS_OUTLINE_RULE)
  })
})
