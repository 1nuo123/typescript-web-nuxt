<template>
  <section class="codex-page mx-auto grid w-full min-w-0 max-w-xl gap-6">
    <CodexMobilePageHeader title="验证电脑" />
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
      打开连接助手
    </BaseButton>
    <p
      v-if="hostStatusLoaded && !agentRelease?.download_url && !releaseError"
      class="m-0 text-sm text-ink-muted"
    >
      暂未发布可下载版本。
    </p>
    <AppAlert
      v-if="releaseError"
      variant="warning"
      title="下载信息不可用"
      :description="releaseError"
    />

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

const {
  devicesStore,
  userCode,
  showManualFallback,
  agentRelease,
  internalReleaseAcknowledged,
  hostStatusLoaded,
  flowError,
  restarting,
  fallbackVerificationUrl,
  connectedHost,
  isInternalRelease,
  canDownloadAgent,
  resultLabel,
  resultVariant,
  readAuthorization,
  decide,
  continueConnection,
  downloadAgent,
  openTasks,
  releaseError,
} = useCodexEnrollment()
</script>
