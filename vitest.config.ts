import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

const NUXT_TEST_HOOK_TIMEOUT_MS = 60_000
const NUXT_TEST_TIMEOUT_MS = 30_000

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: [
        'app/composables/useApi.ts',
        'app/composables/useAuthenticatedApi.ts',
        'app/composables/useClientLogger.ts',
        'app/composables/useCodexRealtime.client.ts',
        'app/components/layout/AppSidebar.vue',
        'app/layouts/default.vue',
        'app/middleware/framework.global.ts',
        'app/plugins/runtime-errors.client.ts',
        'app/plugins/runtime-errors.server.ts',
        'app/services/api/envelope.ts',
        'app/stores/auth.ts',
        'app/stores/codex-realtime.ts',
        'app/stores/codex-session.ts',
        'app/utils/codex-diff.ts',
        'app/utils/codex-event-reducer.ts',
        'app/utils/codex-event-validator.ts',
        'app/utils/errors.ts',
        'app/utils/breakpoints.ts',
        'app/utils/theme.ts',
      ],
      thresholds: {
        statements: 50,
        branches: 40,
        functions: 35,
        lines: 50,
      },
    },
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.{test,spec}.ts'],
          environment: 'node',
        },
      },
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['tests/nuxt/**/*.{test,spec}.ts'],
          environment: 'nuxt',
          hookTimeout: NUXT_TEST_HOOK_TIMEOUT_MS,
          testTimeout: NUXT_TEST_TIMEOUT_MS,
          environmentOptions: {
            nuxt: {
              rootDir: fileURLToPath(new URL('.', import.meta.url)),
              domEnvironment: 'happy-dom',
            },
          },
        },
      }),
    ],
  },
})
