<template>
  <section class="mx-auto grid w-full min-w-0 max-w-xl gap-6">
    <header class="border-b border-line pb-5">
      <h1 class="m-0 text-xl font-semibold">验证电脑</h1>
    </header>

    <form
      v-if="!devicesStore.verification"
      class="grid gap-4 rounded-lg border border-line bg-surface p-5"
      @submit.prevent="readAuthorization"
    >
      <BaseInput
        v-model="userCode"
        label="用户代码"
        placeholder="ABCD-EFGH"
        autocomplete="one-time-code"
        :error="devicesStore.errorLabel() || ''"
      />
      <BaseButton
        type="submit"
        :loading="devicesStore.loading"
        :disabled="userCode.trim().length < 6"
      >
        读取电脑
      </BaseButton>
    </form>

    <div
      v-else
      class="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface"
    >
      <div class="flex items-center gap-3 px-5 py-4">
        <span
          class="grid size-10 shrink-0 place-items-center rounded-md bg-surface-muted"
        >
          <Laptop class="size-5 text-ink-muted" aria-hidden="true" />
        </span>
        <div class="min-w-0">
          <h2 class="m-0 truncate text-base font-semibold">
            {{ devicesStore.verification.displayName }}
          </h2>
          <p class="mt-1 mb-0 text-sm text-ink-muted">
            {{ devicesStore.verification.platform }}
          </p>
        </div>
      </div>
      <dl
        class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-3 px-5 py-4 text-sm"
      >
        <dt class="text-ink-muted">用户代码</dt>
        <dd class="m-0 text-right font-mono font-semibold">
          {{ devicesStore.verification.userCode }}
        </dd>
        <dt class="text-ink-muted">设备指纹</dt>
        <dd class="m-0 break-all text-right font-mono text-xs leading-relaxed">
          {{ devicesStore.verification.fingerprint }}
        </dd>
      </dl>
      <div
        v-if="
          devicesStore.verification.state ===
          DeviceAuthorizationState.PendingUser
        "
        class="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end"
      >
        <BaseButton
          variant="secondary"
          :loading="devicesStore.loading"
          @click="decide(DeviceAuthorizationDecision.Deny)"
        >
          拒绝
        </BaseButton>
        <BaseButton
          :loading="devicesStore.loading"
          @click="decide(DeviceAuthorizationDecision.Approve)"
        >
          <Check class="size-4" aria-hidden="true" />
          批准
        </BaseButton>
      </div>
      <AppAlert
        v-else
        class="m-4"
        :variant="resultVariant"
        :title="resultLabel"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { Check, Laptop } from '@lucide/vue'
import { AuthScope } from '~/types/auth'
import { RuntimeFeatureFlag } from '~/types/app'
import {
  DeviceAuthorizationDecision,
  DeviceAuthorizationState,
} from '~/types/codex-device'
import { LOGIN_ROUTE } from '~/types/routes'

definePageMeta({
  layout: 'codex',
  requiresAuth: true,
  redirectTo: LOGIN_ROUTE,
  requiredScopes: [AuthScope.CodexHostManage],
  requiredRuntimeFlag: RuntimeFeatureFlag.Codex,
  title: '验证电脑',
})

const route = useRoute()
const devicesStore = useCodexDevicesStore()
const userCode = ref(
  typeof route.query.user_code === 'string' ? route.query.user_code : '',
)

const resultLabel = computed(() => {
  const state = devicesStore.verification?.state
  if (state === DeviceAuthorizationState.Approved) return '电脑已批准'
  if (state === DeviceAuthorizationState.Denied) return '电脑已拒绝'
  if (state === DeviceAuthorizationState.Expired) return '授权已过期'
  return '授权状态已更新'
})

const resultVariant = computed<'success' | 'warning' | 'danger'>(() => {
  const state = devicesStore.verification?.state
  if (state === DeviceAuthorizationState.Approved) return 'success'
  if (state === DeviceAuthorizationState.Expired) return 'warning'
  return 'danger'
})

const readAuthorization = async () => {
  await devicesStore.readAuthorization(userCode.value)
}

const decide = async (decision: DeviceAuthorizationDecision) => {
  await devicesStore.decideAuthorization(decision)
}

onMounted(async () => {
  devicesStore.clearVerification()
  if (userCode.value.trim()) await readAuthorization()
})
</script>
