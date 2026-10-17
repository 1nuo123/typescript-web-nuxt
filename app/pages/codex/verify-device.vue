<template>
  <section class="mx-auto grid w-full min-w-0 max-w-xl gap-6">
    <header class="border-b border-line pb-5">
      <h1 class="m-0 text-xl font-semibold">验证电脑</h1>
    </header>
    <AppAlert
      v-if="flowError"
      variant="warning"
      title="连接尚未完成"
      :description="flowError"
    />
    <BaseButton
      v-if="!connectedHost"
      variant="secondary"
      :loading="restarting"
      @click="continueConnection"
    >
      已安装，继续连接
    </BaseButton>
    <p
      v-if="hostStatusLoaded && !agentRelease?.download_url"
      class="m-0 text-sm text-ink-muted"
    >
      暂未发布可下载版本。
    </p>

    <AppAlert
      v-if="isInternalRelease"
      variant="warning"
      title="内部体验安装包"
      description="此包未完成正式代码签名和自动更新发布。请只从本页下载，并在安装前核对 SHA-256。"
    >
      <div class="grid w-full gap-2 text-sm">
        <p class="m-0 text-ink-muted">
          版本 {{ agentRelease?.version }} · SHA-256
        </p>
        <code
          class="break-all rounded-md bg-canvas px-2 py-1.5 text-xs text-ink"
        >
          {{ agentRelease?.artifact_sha256 }}
        </code>
        <label class="flex items-start gap-2 text-sm text-ink">
          <input
            v-model="internalReleaseAcknowledged"
            type="checkbox"
            class="mt-0.5 size-4 shrink-0 accent-primary"
            aria-label="已了解内部体验包风险"
          />
          <span>我已了解这是内部体验包，并会使用自己的账号完成设备授权。</span>
        </label>
      </div>
    </AppAlert>

    <div
      v-if="!hostStatusLoaded"
      class="grid justify-items-center gap-3 rounded-lg border border-line bg-surface p-6 text-center"
    >
      <BaseLoading label="正在检查 Agent 状态" />
    </div>

    <div
      v-else-if="connectedHost"
      class="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface"
    >
      <div class="flex items-center gap-3 px-5 py-4">
        <span
          class="grid size-10 shrink-0 place-items-center rounded-md bg-surface-muted"
        >
          <Laptop class="size-5 text-ink-muted" aria-hidden="true" />
        </span>
        <div class="min-w-0">
          <h2 class="m-0 text-base font-semibold">Agent 已连接</h2>
          <p class="mt-1 mb-0 truncate text-sm text-ink-muted">
            {{ connectedHost.display_name }} · Agent
            {{ connectedHost.agent_version || '已在线' }}
          </p>
        </div>
      </div>
      <div
        class="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end"
      >
        <BaseButton
          v-if="agentRelease"
          variant="secondary"
          :disabled="!canDownloadAgent"
          @click="downloadAgent"
        >
          重新下载安装包
        </BaseButton>
        <BaseButton @click="openTasks">进入 Remote</BaseButton>
      </div>
    </div>

    <form
      v-else-if="!devicesStore.verification && showManualFallback"
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
      <div
        v-if="fallbackVerificationUrl"
        class="grid justify-items-center gap-2 border-t border-line pt-4"
      >
        <QrcodeVue
          :value="fallbackVerificationUrl"
          :size="160"
          level="M"
          render-as="svg"
        />
        <p class="m-0 text-center text-xs text-ink-muted">
          可用另一台已登录设备扫描后继续验证。
        </p>
      </div>
      <BaseButton
        v-if="agentRelease"
        type="button"
        variant="secondary"
        :disabled="!canDownloadAgent"
        @click="downloadAgent"
      >
        下载 Agent {{ agentRelease.version }}
      </BaseButton>
    </form>

    <div
      v-else-if="!devicesStore.verification"
      class="grid justify-items-center gap-3 rounded-lg border border-line bg-surface p-6 text-center"
    >
      <BaseLoading label="正在等待本机 Agent" />
      <p class="m-0 text-sm text-ink-muted">
        已发起安全连接。若 Agent 未启动，可切换到用户代码方式。
      </p>
      <BaseButton
        size="sm"
        variant="secondary"
        @click="showManualFallback = true"
      >
        使用用户代码
      </BaseButton>
      <BaseButton
        v-if="agentRelease"
        size="sm"
        variant="ghost"
        :disabled="!canDownloadAgent"
        @click="downloadAgent"
      >
        下载 Agent {{ agentRelease.version }}
      </BaseButton>
    </div>

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
import QrcodeVue from 'qrcode.vue'
import { AuthScope } from '~/types/auth'
import { RuntimeFeatureFlag } from '~/types/app'
import type { CodexAgentReleaseDownloadDetail } from '~/types/codex-agent-release'
import { CodexHostStatus } from '~/types/codex-host'
import {
  DeviceAuthorizationDecision,
  DeviceAuthorizationState,
} from '~/types/codex-device'
import { CodexEnrollmentIntentState } from '~/types/codex-enrollment'
import { LOGIN_ROUTE } from '~/types/routes'
import { normalizeApiError } from '~/utils/errors'

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
const intentId = ref(
  typeof route.query.intent_id === 'string' ? route.query.intent_id : '',
)
const showManualFallback = ref(!intentId.value)
const agentRelease = ref<CodexAgentReleaseDownloadDetail | null>(null)
const internalReleaseAcknowledged = ref(false)
const browserOrigin = ref('')
const hostStatusLoaded = ref(false)
const ENROLLMENT_POLL_INTERVAL_MS = 1_000
const ENROLLMENT_POLL_MAXIMUM_ATTEMPTS = 300
const CONNECTED_WORKSPACE_TIMEOUT_MS = 300_000
let workspaceWaitInFlight: Promise<void> | null = null
const flowError = ref('')
const restarting = ref(false)
const connectionWaitAbort = new AbortController()
let pollingStopped = false
let pollingTimer: ReturnType<typeof setTimeout> | null = null
let resolvePoll: (() => void) | null = null

const fallbackVerificationUrl = computed(() => {
  const normalizedCode = userCode.value.trim().toUpperCase()
  if (!browserOrigin.value || normalizedCode.length < 6) return ''
  const url = new URL('/codex/verify-device', browserOrigin.value)
  url.searchParams.set('user_code', normalizedCode)
  return url.toString()
})

const connectedHost = computed(
  () =>
    devicesStore.hosts.find(
      (host) =>
        host.status === CodexHostStatus.Online &&
        host.host_id === devicesStore.verification?.hostId,
    ) ?? null,
)

const isInternalRelease = computed(
  () =>
    !!agentRelease.value?.download_url &&
    agentRelease.value.distribution_mode === 'internal',
)

const canDownloadAgent = computed(
  () =>
    Boolean(agentRelease.value?.download_url) &&
    (!isInternalRelease.value || internalReleaseAcknowledged.value),
)

const resultLabel = computed(() => {
  const state = devicesStore.verification?.state
  if (state === DeviceAuthorizationState.Approved)
    return '电脑已批准，等待本机选择项目目录并上线'
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
  flowError.value = ''
  try {
    await devicesStore.readAuthorization(userCode.value)
  } catch {
    flowError.value =
      devicesStore.errorLabel() || '无法读取授权，请检查用户代码后重试。'
  }
}

const decide = async (decision: DeviceAuthorizationDecision) => {
  try {
    await devicesStore.decideAuthorization(decision)
    if (decision === DeviceAuthorizationDecision.Approve)
      await waitForConnectedWorkspace()
  } catch {
    flowError.value = devicesStore.errorLabel() || '授权未完成，请重试。'
  }
}

const continueConnection = async (): Promise<void> => {
  if (restarting.value) return
  restarting.value = true
  flowError.value = ''
  try {
    if (
      devicesStore.verification?.state === DeviceAuthorizationState.Approved
    ) {
      await waitForConnectedWorkspace()
      return
    }
    const enrollment = await new CodexEnrollmentClient().create()
    if (!('launch_uri' in enrollment.detail)) throw new Error('连接请求未签发')
    intentId.value = enrollment.header.intent_id
    devicesStore.clearVerification()
    showManualFallback.value = false
    window.location.assign(enrollment.detail.launch_uri)
    await pollEnrollmentIntent()
  } catch {
    flowError.value = '无法继续连接，请重试；跨设备连接可使用用户代码。'
  } finally {
    restarting.value = false
  }
}

const downloadAgent = (): void => {
  if (agentRelease.value?.download_url && canDownloadAgent.value)
    window.location.assign(agentRelease.value.download_url)
}

const openTasks = async (): Promise<void> => {
  await waitForConnectedWorkspace()
}

const waitForConnectedWorkspace = (): Promise<void> => {
  if (workspaceWaitInFlight) return workspaceWaitInFlight
  workspaceWaitInFlight = pollConnectedWorkspace().finally(() => {
    workspaceWaitInFlight = null
  })
  return workspaceWaitInFlight
}

const pollConnectedWorkspace = async (): Promise<void> => {
  const sessionStore = useCodexSessionStore()
  const targetHostId = devicesStore.verification?.hostId
  if (!targetHostId || pollingStopped) return
  const deadline = Date.now() + CONNECTED_WORKSPACE_TIMEOUT_MS
  let online = false
  let lastError = ''
  try {
    await createCodexHostsClient().activate(
      targetHostId,
      connectionWaitAbort.signal,
    )
  } catch (error) {
    if (!pollingStopped)
      flowError.value = normalizeApiError(error).message || '切换电脑失败。'
    return
  }
  while (Date.now() < deadline && !pollingStopped) {
    try {
      await sessionStore.loadHosts()
      if (pollingStopped) return
      online = sessionStore.hosts.some(
        (host) =>
          host.host_id === targetHostId &&
          host.status === CodexHostStatus.Online,
      )
      const host = sessionStore.hosts.find(
        (host) => host.host_id === targetHostId,
      )
      if (host?.status === CodexHostStatus.Revoked) {
        flowError.value = '这台电脑的授权已撤销，请重新连接并授权。'
        return
      }
      if (online) {
        await sessionStore.selectHost(targetHostId)
        if (pollingStopped) return
        if (sessionStore.selectedWorkspaceId) {
          await navigateTo({
            path: '/codex/tasks',
            query: {
              hostId: targetHostId,
              workspaceId: sessionStore.selectedWorkspaceId,
            },
          })
          return
        }
      }
      lastError = ''
    } catch (error) {
      if (pollingStopped) return
      const normalized = normalizeApiError(error)
      if ([401, 403].includes(normalized.statusCode)) {
        flowError.value =
          normalized.statusCode === 401
            ? '登录授权已失效，请重新登录。'
            : '请求被拒绝，请核对账号权限或网关策略。'
        return
      }
      if (
        ![408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524].includes(
          normalized.statusCode,
        )
      ) {
        flowError.value = normalized.message
        return
      }
      lastError = '控制面或网关暂时不可达；已保留电脑授权，恢复后点击继续连接。'
    }
    await waitForNextPoll()
  }
  if (!pollingStopped)
    flowError.value =
      lastError ||
      (online
        ? '电脑已上线，但尚未同步项目。请在本机确认目录与执行配置后继续。'
        : '电脑尚未上线。请检查本机 Agent 是否运行及网络状态，无需重新绑定。')
}

const waitForNextPoll = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    resolvePoll = resolve
    pollingTimer = setTimeout(resolve, ENROLLMENT_POLL_INTERVAL_MS)
  })
}

const pollEnrollmentIntent = async (): Promise<void> => {
  if (!intentId.value) return
  const client = new CodexEnrollmentClient()
  for (
    let attempt = 0;
    attempt < ENROLLMENT_POLL_MAXIMUM_ATTEMPTS && !pollingStopped;
    attempt += 1
  ) {
    const enrollment = await client.read(intentId.value)
    if (
      enrollment.detail.state === CodexEnrollmentIntentState.Consumed &&
      'authorization' in enrollment.detail &&
      enrollment.detail.authorization &&
      enrollment.detail.user_code
    ) {
      userCode.value = enrollment.detail.user_code
      devicesStore.setVerificationFromIntent(
        enrollment.detail.user_code,
        enrollment.detail.authorization,
      )
      return
    }
    await waitForNextPoll()
  }
  if (!pollingStopped) showManualFallback.value = true
}

onMounted(async () => {
  browserOrigin.value = window.location.origin
  devicesStore.clearVerification()
  const [releaseResult] = await Promise.allSettled([
    new CodexAgentReleaseClient().readCurrent(),
    devicesStore.loadHosts(),
  ])
  if (releaseResult.status === 'fulfilled')
    agentRelease.value = releaseResult.value.detail
  else agentRelease.value = null
  hostStatusLoaded.value = true
  if (connectedHost.value) return
  if (intentId.value) {
    try {
      await pollEnrollmentIntent()
    } catch {
      showManualFallback.value = true
    }
    return
  }
  if (userCode.value.trim()) await readAuthorization()
})

onBeforeUnmount(() => {
  pollingStopped = true
  connectionWaitAbort.abort()
  if (pollingTimer !== null) clearTimeout(pollingTimer)
  resolvePoll?.()
})
</script>
