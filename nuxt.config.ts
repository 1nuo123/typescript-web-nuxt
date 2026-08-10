import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import {
  DEFAULT_DEVELOPMENT_API_BASE_URL,
  DEFAULT_PRODUCTION_API_BASE_URL,
  parseRuntimeApiTimeout,
} from './app/types/api'
import { DEFAULT_APP_NAME } from './app/types/app'
import { THEME_BOOTSTRAP_SCRIPT } from './app/utils/theme'

const appDir = fileURLToPath(new URL('./app', import.meta.url))
const runtimePublicApiBaseURL =
  process.env.NUXT_PUBLIC_API_BASE_URL ||
  (process.env.NODE_ENV === 'production'
    ? DEFAULT_PRODUCTION_API_BASE_URL
    : DEFAULT_DEVELOPMENT_API_BASE_URL)
const runtimeServerApiBaseURL =
  process.env.NUXT_API_BASE_URL || runtimePublicApiBaseURL
const runtimeApiTimeout = parseRuntimeApiTimeout(
  process.env.NUXT_PUBLIC_API_TIMEOUT,
)
const ENABLED_ENV_VALUE = 'true'
const runtimeAdminOpsEnabled =
  process.env.NUXT_PUBLIC_ADMIN_OPS_ENABLED === ENABLED_ENV_VALUE
const runtimeCodexFeatureEnabled =
  process.env.NUXT_PUBLIC_CODEX_FEATURE_ENABLED === ENABLED_ENV_VALUE
const isE2e = process.env.NUXT_E2E === ENABLED_ENV_VALUE
const enablePwaModule =
  process.env.NODE_ENV !== 'test' && process.env.VITEST !== 'true' && !isE2e

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: process.env.NUXT_SSR !== 'false',
  sourcemap: {
    client: false,
    server: false,
  },
  devtools: {
    enabled: process.env.NODE_ENV !== 'production' && !isE2e,
  },

  modules: [
    '@nuxt/a11y',
    '@nuxt/eslint',
    ...(!isE2e ? ['@nuxt/hints'] : []),
    '@pinia/nuxt',
    ...(enablePwaModule ? ['@vite-pwa/nuxt'] : []),
  ],

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      id: '/codex/tasks',
      name: 'Codex 远程控制',
      short_name: 'Codex',
      description: '安全控制本机 Codex 任务',
      display: 'standalone',
      start_url: '/codex/tasks',
      scope: '/',
      background_color: '#fafafa',
      theme_color: '#ffffff',
      icons: [
        {
          src: '/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable',
        },
      ],
    },
    workbox: {
      cleanupOutdatedCaches: true,
      navigateFallback: '/',
      navigateFallbackDenylist: [/^\/auth\//, /^\/codex\//, /^\/internal\//],
      runtimeCaching: [],
    },
    devOptions: {
      enabled: false,
    },
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    apiSecret: '',
    apiBaseURL: runtimeServerApiBaseURL,
    public: {
      appName: DEFAULT_APP_NAME,
      apiBaseURL: runtimePublicApiBaseURL,
      apiTimeout: runtimeApiTimeout,
      adminOpsEnabled: runtimeAdminOpsEnabled,
      codexFeatureEnabled: runtimeCodexFeatureEnabled,
      codexRealtimePath:
        process.env.NUXT_PUBLIC_CODEX_REALTIME_PATH || '/codex/events',
      codexWsBaseUrl: process.env.NUXT_PUBLIC_CODEX_WS_BASE_URL || '',
    },
  },

  app: {
    head: {
      htmlAttrs: {
        lang: 'zh-CN',
      },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'color-scheme', content: 'light dark' },
      ],
      script: [
        {
          key: 'theme-bootstrap',
          innerHTML: THEME_BOOTSTRAP_SCRIPT,
          tagPosition: 'head',
        },
      ],
    },
  },

  components: [
    {
      path: '~/components',
      pathPrefix: false,
    },
  ],

  imports: {
    dirs: ['composables/**', 'stores/**', 'utils/**', 'services/api/**'],
  },

  alias: {
    '@app': appDir,
    '@types': fileURLToPath(new URL('./app/types', import.meta.url)),
    '@utils': fileURLToPath(new URL('./app/utils', import.meta.url)),
  },

  routeRules: {
    // Session-aware pages restore an in-memory access token from the HttpOnly
    // refresh cookie. Rendering them only in the browser prevents credentials
    // from entering the Nuxt payload and keeps the pre-hydration DOM stable.
    '/': { ssr: false },
    '/login': { ssr: false },
    '/register': { ssr: false },
    '/account': { ssr: false },
    '/account/**': { ssr: false },
    '/admin': { ssr: false },
    '/admin/**': { ssr: false },
    '/codex': { ssr: false },
    '/codex/**': { ssr: false },
  },

  nitro: {
    preset: 'node-server',
  },

  vite: {
    plugins: [tailwindcss()],
    build: {
      target: 'es2022',
    },
  },
})
