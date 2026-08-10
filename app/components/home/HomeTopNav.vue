<template>
  <header
    class="home-top-nav sticky top-0 z-30 border-b bg-elevated/92 px-4 backdrop-blur-xl transition-[border-color,box-shadow] duration-200 sm:px-6"
    :class="
      isScrolled ? 'border-line shadow-card' : 'border-transparent shadow-none'
    "
  >
    <div
      class="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between gap-4"
    >
      <NuxtLink
        class="flex min-w-0 items-center gap-3 no-underline"
        :to="PUBLIC_HOME_ROUTE"
      >
        <span
          class="grid size-9 flex-none place-items-center rounded-md bg-primary text-canvas shadow-[0_4px_12px_color-mix(in_srgb,var(--ui-primary)_24%,transparent)]"
          aria-hidden="true"
        >
          <PanelsTopLeft class="size-[1.125rem]" />
        </span>
        <span class="grid min-w-0">
          <span
            class="overflow-hidden text-ellipsis whitespace-nowrap text-[0.9rem] font-bold text-ink"
          >
            {{ appName }}
          </span>
          <span
            class="overflow-hidden text-ellipsis whitespace-nowrap text-[0.7rem] font-medium text-ink-muted max-md:hidden"
          >
            Workspace
          </span>
        </span>
      </NuxtLink>

      <div class="flex min-w-0 items-center justify-end">
        <BaseButton
          v-if="!authStore.isAuthenticated"
          variant="secondary"
          size="sm"
          type="button"
          title="登录"
          @click="goToLogin"
        >
          登录
        </BaseButton>
        <HomeTopNavUserMenu
          v-else
          :username="currentUsername"
          :logout-pending="logoutPending"
          @account="goToAccount"
          @logout="logoutAndReturnHome"
        />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { PanelsTopLeft } from '@lucide/vue'
import { ACCOUNT_ROUTE, LOGIN_ROUTE, PUBLIC_HOME_ROUTE } from '~/types/routes'

const HOME_NAV_SCROLL_THRESHOLD = 4

const runtimeConfig = useRuntimeConfig()
const authStore = useAuthStore()
const isScrolled = ref(false)
const logoutPending = ref(false)

let scrollFrame = 0

const appName = computed(() => {
  return String(runtimeConfig.public.appName || 'Workspace')
})
const currentUsername = computed(() => authStore.principal?.username || 'User')

const syncScrollState = () => {
  scrollFrame = 0
  isScrolled.value = window.scrollY > HOME_NAV_SCROLL_THRESHOLD
}

const handleScroll = () => {
  if (scrollFrame !== 0) {
    return
  }

  scrollFrame = window.requestAnimationFrame(syncScrollState)
}

const goToLogin = async () => {
  await navigateTo(LOGIN_ROUTE)
}

const goToAccount = async () => {
  await navigateTo(ACCOUNT_ROUTE)
}

const logoutAndReturnHome = async () => {
  if (logoutPending.value) {
    return
  }

  logoutPending.value = true

  try {
    const revokePromise = authStore.logout()
    await navigateTo(PUBLIC_HOME_ROUTE)
    await revokePromise
  } finally {
    logoutPending.value = false
  }
}

onMounted(() => {
  syncScrollState()
  window.addEventListener('scroll', handleScroll, { passive: true })
})

onBeforeUnmount(() => {
  if (scrollFrame !== 0) {
    window.cancelAnimationFrame(scrollFrame)
  }

  window.removeEventListener('scroll', handleScroll)
})
</script>
