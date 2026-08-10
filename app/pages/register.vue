<template>
  <AuthPanel
    eyebrow="账号中心"
    title="注册"
    title-id="register-title"
    description="创建账号后将自动登录。"
  >
    <form class="grid gap-3" novalidate @submit.prevent="submitRegistration">
      <BaseInput
        v-model="username"
        label="用户名"
        name="username"
        autocomplete="username"
        :error="fieldErrors.username"
        :disabled="isSubmitting"
      />
      <BaseInput
        v-model="password"
        label="密码"
        name="password"
        type="password"
        autocomplete="new-password"
        :error="fieldErrors.password"
        :disabled="isSubmitting"
      />
      <BaseInput
        v-model="passwordConfirmation"
        label="确认密码"
        name="password_confirmation"
        type="password"
        autocomplete="new-password"
        :error="fieldErrors.passwordConfirmation"
        :disabled="isSubmitting"
      />
      <AppAlert
        v-if="errorMessage"
        variant="danger"
        title="注册失败"
        :description="errorMessage"
      />
      <div
        class="grid grid-cols-[minmax(9rem,1fr)_auto_auto] items-center gap-2 max-sm:grid-cols-1 max-sm:[&_button]:w-full"
      >
        <BaseButton type="submit" :loading="isSubmitting">注册</BaseButton>
        <BaseButton
          variant="ghost"
          :disabled="isSubmitting"
          @click="navigateTo(LOGIN_ROUTE)"
          >登录</BaseButton
        >
        <BaseButton
          variant="ghost"
          :disabled="isSubmitting"
          @click="navigateTo(PUBLIC_HOME_ROUTE)"
          >返回首页</BaseButton
        >
      </div>
    </form>
  </AuthPanel>
</template>

<script setup lang="ts">
import { AuthErrorCode, AuthSessionStatus } from '~/types/auth'
import { AUTH_LAYOUT_NAME } from '~/types/layouts'
import { ACCOUNT_ROUTE, LOGIN_ROUTE, PUBLIC_HOME_ROUTE } from '~/types/routes'

const REGISTER_PAGE_TITLE = '注册'
const USERNAME_MIN_LENGTH = 3
const USERNAME_MAX_LENGTH = 64
const PASSWORD_MIN_LENGTH = 12
const PASSWORD_MAX_LENGTH = 128
const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/
const USERNAME_FORMAT_ERROR_MESSAGE =
  '用户名只能使用小写字母、数字、点、下划线或连字符，且首尾必须是字母或数字。'
const FALLBACK_REGISTRATION_ERROR_MESSAGE = '暂时无法完成注册，请稍后重试。'

interface RegistrationFieldErrors {
  username: string
  password: string
  passwordConfirmation: string
}

definePageMeta({
  layout: AUTH_LAYOUT_NAME,
  title: REGISTER_PAGE_TITLE,
  guestOnly: true,
})

useSeoMeta({
  title: REGISTER_PAGE_TITLE,
  description: '账号注册入口。',
})

const authStore = useAuthStore()
const username = ref('')
const password = ref('')
const passwordConfirmation = ref('')
const errorMessage = ref('')
const fieldErrors = reactive<RegistrationFieldErrors>({
  username: '',
  password: '',
  passwordConfirmation: '',
})
const isSubmitting = computed(
  () =>
    authStore.status === AuthSessionStatus.RegistrationPending ||
    authStore.status === AuthSessionStatus.LoginPending,
)

watch(username, () => {
  fieldErrors.username = ''
})
watch(password, () => {
  fieldErrors.password = ''
  fieldErrors.passwordConfirmation = ''
})
watch(passwordConfirmation, () => {
  fieldErrors.passwordConfirmation = ''
})

const validateForm = () => {
  const normalizedUsername = username.value.trim()

  fieldErrors.username =
    normalizedUsername.length < USERNAME_MIN_LENGTH
      ? `用户名至少需要 ${USERNAME_MIN_LENGTH} 个字符。`
      : normalizedUsername.length > USERNAME_MAX_LENGTH
        ? `用户名不能超过 ${USERNAME_MAX_LENGTH} 个字符。`
        : USERNAME_PATTERN.test(normalizedUsername)
          ? ''
          : USERNAME_FORMAT_ERROR_MESSAGE
  fieldErrors.password =
    password.value.length < PASSWORD_MIN_LENGTH
      ? `密码至少需要 ${PASSWORD_MIN_LENGTH} 个字符。`
      : password.value.length > PASSWORD_MAX_LENGTH
        ? `密码不能超过 ${PASSWORD_MAX_LENGTH} 个字符。`
        : ''
  fieldErrors.passwordConfirmation =
    passwordConfirmation.value === password.value
      ? ''
      : '两次输入的密码不一致。'

  return !Object.values(fieldErrors).some(Boolean)
}

const resolveRegistrationError = (error: {
  errorCode?: string
  message?: string
}) => {
  if (error.errorCode === AuthErrorCode.RegistrationUsernameConflict) {
    return '该用户名不可用，请更换后重试。'
  }

  if (error.errorCode === AuthErrorCode.RequestThrottled) {
    return '注册请求过于频繁，请稍后重试。'
  }

  if (error.errorCode === AuthErrorCode.RegistrationDisabled) {
    return '当前未开放注册。'
  }

  return error.message || FALLBACK_REGISTRATION_ERROR_MESSAGE
}

const submitRegistration = async () => {
  errorMessage.value = ''
  if (!validateForm()) {
    return
  }

  try {
    username.value = username.value.trim()
    await authStore.register(username.value, password.value)
    await navigateTo(ACCOUNT_ROUTE)
  } catch (error) {
    errorMessage.value = resolveRegistrationError(
      error as { errorCode?: string; message?: string },
    )
  }
}
</script>
