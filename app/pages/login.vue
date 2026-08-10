<template>
  <AuthPanel
    eyebrow="账号中心"
    title="登录"
    title-id="login-title"
    description="登录后会回到原先访问的页面。"
  >
    <form class="grid gap-3" @submit.prevent="submitLogin">
      <BaseInput
        v-model="username"
        label="用户名"
        name="username"
        autocomplete="username"
        :disabled="authStore.status === AuthSessionStatus.LoginPending"
      />
      <BaseInput
        v-model="password"
        label="密码"
        name="password"
        type="password"
        autocomplete="current-password"
        :disabled="authStore.status === AuthSessionStatus.LoginPending"
      />
      <AppAlert
        v-if="errorMessage"
        variant="danger"
        title="登录失败"
        :description="errorMessage"
      />
      <div
        class="grid grid-cols-[minmax(9rem,1fr)_auto_auto] items-center gap-2 max-sm:grid-cols-1 max-sm:[&_button]:w-full"
      >
        <BaseButton
          type="submit"
          :loading="authStore.status === AuthSessionStatus.LoginPending"
        >
          登录
        </BaseButton>
        <BaseButton variant="ghost" @click="navigateTo(REGISTER_ROUTE)"
          >注册</BaseButton
        >
        <BaseButton variant="ghost" @click="navigateTo(PUBLIC_HOME_ROUTE)"
          >返回首页</BaseButton
        >
      </div>
    </form>
  </AuthPanel>
</template>

<script setup lang="ts">
import { AUTH_LAYOUT_NAME } from '~/types/layouts'
import { AuthSessionStatus } from '~/types/auth'
import {
  ADMIN_ROUTE_PREFIX,
  AUTH_GUEST_ROUTES,
  PUBLIC_HOME_ROUTE,
  REGISTER_ROUTE,
} from '~/types/routes'

const LOGIN_PAGE_TITLE = '登录'
const FALLBACK_LOGIN_ERROR_MESSAGE =
  '用户名、密码或账号状态不符合后端认证要求。'

definePageMeta({
  layout: AUTH_LAYOUT_NAME,
  title: LOGIN_PAGE_TITLE,
  guestOnly: true,
})

useSeoMeta({
  title: LOGIN_PAGE_TITLE,
  description: '账号登录入口。',
})

const route = useRoute()
const authStore = useAuthStore()
const username = ref('')
const password = ref('')
const errorMessage = ref('')

const redirectPath = computed(() => {
  const redirect = route.query.redirect

  return typeof redirect === 'string' &&
    redirect.startsWith(PUBLIC_HOME_ROUTE) &&
    !redirect.startsWith('//') &&
    !(AUTH_GUEST_ROUTES as readonly string[]).includes(redirect)
    ? redirect
    : ''
})
const postLoginRoute = computed(() => {
  return (
    redirectPath.value ||
    (authStore.isAdmin ? ADMIN_ROUTE_PREFIX : PUBLIC_HOME_ROUTE)
  )
})

const submitLogin = async () => {
  errorMessage.value = ''

  try {
    await authStore.login(username.value, password.value)
    await navigateTo(postLoginRoute.value)
  } catch (error) {
    const normalized = error as { message?: string }
    errorMessage.value = normalized.message || FALLBACK_LOGIN_ERROR_MESSAGE
  }
}
</script>
