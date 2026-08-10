<template>
  <div
    class="app-frame grid min-h-screen grid-cols-[15.5rem_minmax(0,1fr)] max-lg:block"
  >
    <a
      class="fixed top-4 left-4 z-60 -translate-y-[150%] rounded-md bg-ink px-3 py-2 font-bold text-canvas no-underline transition-transform duration-150 focus:translate-y-0"
      href="#main-content"
    >
      {{ SKIP_LINK_LABEL }}
    </a>
    <AppSidebar
      :items="navigationItems"
      :open="appStore.sidebarOpen"
      @close="appStore.closeSidebar"
    />
    <div
      class="flex min-w-0 flex-col"
      :aria-hidden="mainHidden || undefined"
      :inert="mainHidden || undefined"
    >
      <AppHeader
        :title="appName"
        :items="navigationItems"
        :navigation-open="appStore.sidebarOpen"
        @toggle-navigation="appStore.toggleSidebar"
      >
        <template #actions>
          <div
            class="inline-flex max-w-full items-center gap-0.5 rounded-md border border-line bg-surface p-0.5 shadow-[0_1px_2px_rgb(18_24_33/0.04)]"
            role="group"
            :aria-label="THEME_GROUP_LABEL"
          >
            <BaseButton
              v-for="theme in themeOptions"
              :key="theme.value"
              class="w-9 max-md:w-8"
              icon
              size="sm"
              :variant="preference === theme.value ? 'primary' : 'ghost'"
              :aria-label="theme.label"
              :aria-pressed="preference === theme.value"
              :title="theme.label"
              @click="setTheme(theme.value)"
            >
              <component :is="theme.icon" class="size-4" aria-hidden="true" />
              <span class="sr-only">{{ theme.label }}</span>
            </BaseButton>
          </div>
          <BaseButton
            v-if="showLogoutAction"
            variant="ghost"
            size="sm"
            type="button"
            :loading="logoutPending"
            :title="LOGOUT_BUTTON_LABEL"
            @click="logoutAndRedirect"
          >
            <LogOut class="size-4" aria-hidden="true" />
            <span>{{ LOGOUT_BUTTON_LABEL }}</span>
          </BaseButton>
        </template>
      </AppHeader>
      <main
        id="main-content"
        class="w-full min-w-0 flex-1 p-5 max-lg:p-4 xl:p-6"
        tabindex="-1"
      >
        <div class="mx-auto grid w-full max-w-[76rem] gap-6">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { LogOut, Monitor, Moon, Sun } from '@lucide/vue'
import {
  RuntimeFeatureFlag,
  type AppNavItem,
  type ThemePreference,
} from '~/types/app'
import { AdminBoundaryPolicy } from '~/types/auth'
import { ADMIN_ROUTE_PREFIX, LOGIN_ROUTE } from '~/types/routes'

interface NavigationConfig {
  items?: AppNavItem[]
}

const runtimeConfig = useRuntimeConfig()
const appConfig = useAppConfig()
const appStore = useAppStore()
const authStore = useAuthStore()
const route = useRoute()
const { preference, setTheme } = useTheme()
const { isNavigationModal } = useBreakpoints()

const SKIP_LINK_LABEL = '跳转到主内容'
const THEME_GROUP_LABEL = '主题'
const LOGOUT_BUTTON_LABEL = '退出'
const SYSTEM_THEME_LABEL = '跟随系统主题'
const LIGHT_THEME_LABEL = '浅色主题'
const DARK_THEME_LABEL = '深色主题'

const appName = computed(() => String(runtimeConfig.public.appName))
const runtimeFeatures = computed<Record<RuntimeFeatureFlag, boolean>>(() => ({
  [RuntimeFeatureFlag.AdminOps]: Boolean(runtimeConfig.public.adminOpsEnabled),
  [RuntimeFeatureFlag.Codex]: Boolean(runtimeConfig.public.codexFeatureEnabled),
}))
const isAdminRoute = computed(() => {
  return (
    route.path === ADMIN_ROUTE_PREFIX ||
    route.path.startsWith(`${ADMIN_ROUTE_PREFIX}/`)
  )
})
const navigationItems = computed(() => {
  const items =
    (appConfig.navigation as NavigationConfig | undefined)?.items ?? []
  const runtimeEnabledItems = (
    items.length > 0 ? items : APP_NAVIGATION_ITEMS
  ).filter((item) => {
    return (
      !item.requiredRuntimeFlag ||
      runtimeFeatures.value[item.requiredRuntimeFlag]
    )
  })
  const routeScopedItems = runtimeEnabledItems.filter((item) => {
    return (
      isAdminRoute.value ||
      item.adminBoundaryPolicy === AdminBoundaryPolicy.Public
    )
  })

  return authStore.filterNavigationItems(routeScopedItems)
})
const mainHidden = computed(
  () => appStore.sidebarOpen && isNavigationModal.value,
)
const showLogoutAction = computed(
  () => isAdminRoute.value && authStore.isAuthenticated,
)
const logoutPending = ref(false)

const logoutAndRedirect = async () => {
  logoutPending.value = true

  try {
    const revokePromise = authStore.logout()
    await navigateTo(LOGIN_ROUTE)
    await revokePromise
  } finally {
    logoutPending.value = false
  }
}

const themeOptions: Array<{
  value: ThemePreference
  label: string
  icon: typeof Monitor
}> = [
  { value: 'system', label: SYSTEM_THEME_LABEL, icon: Monitor },
  { value: 'light', label: LIGHT_THEME_LABEL, icon: Sun },
  { value: 'dark', label: DARK_THEME_LABEL, icon: Moon },
]
</script>
