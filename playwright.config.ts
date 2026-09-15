import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'
import type { ConfigOptions } from '@nuxt/test-utils/playwright'

const E2E_DEV_SERVER_HOST = '127.0.0.1'
const E2E_DEV_SERVER_PORT = 3320
const DEFAULT_E2E_BASE_URL = `http://${E2E_DEV_SERVER_HOST}:${E2E_DEV_SERVER_PORT}`
const e2eBaseURL = process.env.NUXT_TEST_HOST || DEFAULT_E2E_BASE_URL
const PROJECT_ROOT = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig<ConfigOptions>({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  webServer: process.env.NUXT_TEST_HOST
    ? undefined
    : {
        command: `pnpm exec nuxt dev --host ${E2E_DEV_SERVER_HOST} --port ${E2E_DEV_SERVER_PORT}`,
        cwd: PROJECT_ROOT,
        env: {
          NUXT_E2E: 'true',
          NUXT_IGNORE_LOCK: '1',
          NUXT_PUBLIC_CODEX_FEATURE_ENABLED:
            process.env.NUXT_TEST_CODEX_FEATURE_ENABLED ?? 'false',
        },
        reuseExistingServer: false,
        timeout: 120000,
        url: DEFAULT_E2E_BASE_URL,
      },
  use: {
    trace: 'on-first-retry',
    nuxt: {
      host: e2eBaseURL,
      rootDir: PROJECT_ROOT,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
