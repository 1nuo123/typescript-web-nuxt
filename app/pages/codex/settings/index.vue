<template>
  <section
    class="codex-page mx-auto grid h-full w-full min-w-0 max-w-4xl grid-cols-1 gap-8 overflow-y-auto p-4 sm:p-6"
  >
    <CodexMobilePageHeader title="电脑设置" />
    <header
      class="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <h1 class="m-0 text-xl font-semibold">电脑</h1>
        <p class="mt-1 mb-0 text-sm text-ink-muted">
          {{ activeHostCount }} 台已连接，{{
            devicesStore.hosts.length
          }}
          台已登记
        </p>
      </div>
      <BaseButton :loading="connecting" @click="connectComputer">
        <Plus class="size-4" aria-hidden="true" />
        连接我的电脑
      </BaseButton>
    </header>

    <AppAlert
      v-if="devicesStore.errorLabel()"
      variant="danger"
      title="电脑请求失败"
      :description="devicesStore.errorLabel() || ''"
    />
    <AppAlert
      v-if="connectError"
      variant="warning"
      title="电脑连接未完成"
      :description="connectError"
    />

    <div
      class="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface"
      aria-live="polite"
    >
      <div
        v-if="devicesStore.loading && !devicesStore.hosts.length"
        class="p-5"
      >
        <BaseLoading label="正在读取电脑" />
      </div>
      <div
        v-else-if="!devicesStore.hosts.length"
        class="grid justify-items-center gap-3 px-5 py-10 text-center"
      >
        <Laptop class="size-7 text-ink-muted" aria-hidden="true" />
        <p class="m-0 text-sm font-medium">尚未登记电脑</p>
      </div>
      <article
        v-for="host in devicesStore.hosts"
        :key="host.host_id"
        class="grid min-w-0 gap-4 px-4 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
      >
        <div class="flex min-w-0 items-start gap-3">
          <span
            class="grid size-10 shrink-0 place-items-center rounded-md bg-surface-muted text-ink-muted"
          >
            <Laptop class="size-5" aria-hidden="true" />
          </span>
          <div class="min-w-0">
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <h2 class="m-0 truncate text-sm font-semibold">
                {{ host.display_name }}
              </h2>
              <BaseBadge :tone="statusTone(host.status)">
                {{
                  host.connected && host.status === CodexHostStatus.Offline
                    ? '已连接，执行未就绪'
                    : statusLabel(host.status)
                }}
              </BaseBadge>
              <BaseBadge
                v-if="host.compatibility.state !== 'unknown'"
                :tone="compatibilityTone(host.compatibility.state)"
              >
                {{ compatibilityLabel(host.compatibility.state) }}
              </BaseBadge>
            </div>
            <p class="mt-1 mb-0 truncate text-xs text-ink-muted">
              {{ host.platform }} · Agent {{ host.agent_version || '未上报' }} ·
              {{ host.update.channel }}
            </p>
            <p
              v-if="host.doctor.issue_codes.length"
              class="mt-1 mb-0 truncate text-xs text-warning"
            >
              {{ host.doctor.issue_codes.join('、') }}
            </p>
          </div>
        </div>
        <div class="flex items-center justify-end gap-1">
          <BaseButton
            size="sm"
            variant="secondary"
            :loading="activatingHostId === host.host_id"
            :disabled="
              Boolean(activatingHostId) ||
              host.status === CodexHostStatus.Revoked
            "
            @click="activateComputer(host)"
          >
            {{
              host.status === CodexHostStatus.Online
                ? '进入工作台'
                : '使用这台电脑'
            }}
          </BaseButton>
          <BaseButton
            icon
            size="sm"
            variant="ghost"
            title="重命名电脑"
            aria-label="重命名电脑"
            :disabled="host.status === CodexHostStatus.Revoked"
            @click="openRenameDialog(host)"
          >
            <Pencil class="size-4" aria-hidden="true" />
          </BaseButton>
          <BaseButton
            icon
            size="sm"
            variant="ghost"
            title="撤销电脑"
            aria-label="撤销电脑"
            :disabled="host.status === CodexHostStatus.Revoked"
            @click="openRevokeDialog(host)"
          >
            <ShieldOff class="size-4 text-danger" aria-hidden="true" />
          </BaseButton>
        </div>
      </article>
    </div>

    <section class="grid gap-3 border-t border-line pt-6">
      <h2 class="m-0 text-base font-semibold">连接</h2>
      <div
        class="divide-y divide-line rounded-lg border border-line bg-surface"
      >
        <div class="flex items-center justify-between gap-4 px-4 py-3.5">
          <span class="flex items-center gap-3 text-sm">
            <Radio class="size-4 text-ink-muted" aria-hidden="true" />
            浏览器实时连接
          </span>
          <strong class="text-sm font-medium">{{ realtimeStatusLabel }}</strong>
        </div>
        <div class="flex items-center justify-between gap-4 px-4 py-3.5">
          <span class="flex items-center gap-3 text-sm">
            <RefreshCw class="size-4 text-ink-muted" aria-hidden="true" />
            事件流代次
          </span>
          <span class="max-w-[60%] truncate text-sm text-ink-muted">
            {{ realtimeStore.streamEpoch || '尚未连接' }}
          </span>
        </div>
      </div>
      <div>
        <BaseButton size="sm" variant="ghost" @click="openAddDialog">
          使用用户代码连接
        </BaseButton>
      </div>
    </section>

    <section class="grid gap-3 border-t border-line pt-6">
      <h2 class="m-0 text-base font-semibold">通知</h2>
      <div
        class="flex items-center justify-between gap-4 border border-line bg-surface px-4 py-3.5"
      >
        <span class="text-sm text-ink-muted">系统通知</span>
        <BaseButton
          size="sm"
          variant="secondary"
          :disabled="notificationPermission === 'unsupported'"
          @click="requestNotificationPermission"
        >
          {{ notificationPermissionLabel }}
        </BaseButton>
      </div>
      <p class="m-0 text-xs text-ink-muted">
        通知仅在 Remote 页面保持打开时可用。
      </p>
      <p
        v-if="notificationPermission === 'denied'"
        class="m-0 text-xs text-ink-muted"
      >
        请在浏览器地址栏的站点设置中允许通知，然后点击按钮重新检测。
      </p>
    </section>

    <section
      class="codex-preference-row"
      aria-labelledby="codex-appearance-title"
    >
      <div>
        <h2 id="codex-appearance-title" class="m-0 text-sm font-medium">
          外观
        </h2>
        <p class="mt-1 mb-0 text-xs text-ink-muted">选择适合你的阅读主题。</p>
      </div>
      <div
        class="codex-segmented flex gap-1 rounded-lg p-1"
        role="group"
        aria-label="主题"
      >
        <BaseButton
          v-for="theme in themeOptions"
          :key="theme.value"
          size="sm"
          :variant="preference === theme.value ? 'secondary' : 'ghost'"
          :aria-pressed="preference === theme.value"
          @click="setTheme(theme.value)"
          >{{ theme.label }}</BaseButton
        >
      </div>
    </section>

    <BaseModal
      :open="dialogMode === DialogMode.Add"
      title="使用用户代码连接"
      description="仅在自定义 URI 无法启动或跨设备连接时使用。"
      size="sm"
      @close="closeDialog"
    >
      <form class="grid gap-4" @submit.prevent="openVerification">
        <BaseInput
          v-model="userCode"
          label="用户代码"
          placeholder="ABCD-EFGH"
          autocomplete="one-time-code"
        />
        <BaseButton type="submit" :disabled="userCode.trim().length < 6">
          继续
          <ArrowRight class="size-4" aria-hidden="true" />
        </BaseButton>
      </form>
    </BaseModal>

    <BaseModal
      :open="dialogMode === DialogMode.Rename"
      title="重命名电脑"
      size="sm"
      @close="closeDialog"
    >
      <form class="grid gap-4" @submit.prevent="renameSelectedHost">
        <BaseInput v-model="displayName" label="电脑名称" />
        <AppAlert
          v-if="renameError"
          variant="danger"
          title="重命名失败"
          :description="renameError"
        />
        <BaseButton
          type="submit"
          :loading="dialogSubmitting"
          :disabled="!displayName.trim()"
        >
          保存
        </BaseButton>
      </form>
    </BaseModal>

    <BaseModal
      :open="dialogMode === DialogMode.Revoke"
      title="撤销电脑"
      description="撤销后该电脑必须重新完成设备授权。"
      size="sm"
      @close="closeDialog"
    >
      <form class="grid gap-4" @submit.prevent="revokeSelectedHost">
        <AppAlert
          v-if="revokeError"
          variant="danger"
          title="撤销失败"
          :description="revokeError"
        />
        <BaseInput
          v-model="password"
          type="password"
          label="当前密码"
          autocomplete="current-password"
        />
        <BaseButton
          type="submit"
          variant="danger"
          :loading="dialogSubmitting"
          :disabled="!password"
        >
          <ShieldOff class="size-4" aria-hidden="true" />
          确认撤销
        </BaseButton>
      </form>
    </BaseModal>
  </section>
</template>

<script setup lang="ts">
import {
  ArrowRight,
  Laptop,
  Plus,
  Pencil,
  Radio,
  RefreshCw,
  ShieldOff,
} from '@lucide/vue'
import { AuthScope } from '~/types/auth'
import { RuntimeFeatureFlag, type ThemePreference } from '~/types/app'
import type { ApiErrorPayload } from '~/types/api'
import {
  CodexEnrollmentIntentState,
  type CodexEnrollmentIntentIssuedDetail,
} from '~/types/codex-enrollment'
import {
  CodexHostCompatibilityState,
  CodexHostStatus,
  type CodexHost,
} from '~/types/codex-host'
import { CodexRealtimeConnectionStatus } from '~/types/codex-realtime'
import { LOGIN_ROUTE, buildCodexTasksRoute } from '~/types/routes'
import {
  readCodexBrowserNotificationPermission,
  refreshCodexBrowserNotificationPermission,
  requestCodexBrowserNotificationPermission,
  type CodexBrowserNotificationPermission,
} from '~/utils/codex-browser-notification'

enum DialogMode {
  Closed = 'closed',
  Add = 'add',
  Rename = 'rename',
  Revoke = 'revoke',
}

definePageMeta({
  layout: 'codex',
  requiresAuth: true,
  redirectTo: LOGIN_ROUTE,
  requiredScopes: [AuthScope.CodexHostManage],
  requiredRuntimeFlag: RuntimeFeatureFlag.Codex,
  title: 'Codex 电脑',
})

const { preference, setTheme } = useTheme()
const themeOptions: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

const realtimeStore = useCodexRealtimeStore()
const devicesStore = useCodexDevicesStore()
const dialogMode = ref(DialogMode.Closed)
const selectedHost = ref<CodexHost | null>(null)
const userCode = ref('')
const displayName = ref('')
const password = ref('')
const revokeError = ref('')
const renameError = ref('')
const dialogSubmitting = ref(false)
const connecting = ref(false)
const connectError = ref('')
const activatingHostId = ref<string | null>(null)
const sessionStore = useCodexSessionStore()
const notificationPermission = ref<CodexBrowserNotificationPermission>(
  readCodexBrowserNotificationPermission(),
)
const URI_HANDLER_NAVIGATION_DELAY_MS = 1_200
let navigationTimer: ReturnType<typeof setTimeout> | null = null

const activeHostCount = computed(
  () => devicesStore.hosts.filter((host) => host.connected).length,
)

const notificationPermissionLabel = computed(() => {
  const labels: Readonly<Record<CodexBrowserNotificationPermission, string>> = {
    default: '开启通知',
    granted: '通知已开启',
    denied: '通知已拒绝',
    unsupported: '当前浏览器不支持',
  }
  return labels[notificationPermission.value]
})

const realtimeStatusLabel = computed(() => {
  const labels: Record<CodexRealtimeConnectionStatus, string> = {
    [CodexRealtimeConnectionStatus.Idle]: '待连接',
    [CodexRealtimeConnectionStatus.Connecting]: '连接中',
    [CodexRealtimeConnectionStatus.Connected]: '已连接',
    [CodexRealtimeConnectionStatus.Reconnecting]: '重连中',
    [CodexRealtimeConnectionStatus.Resyncing]: '同步中',
    [CodexRealtimeConnectionStatus.AuthBlocked]: '需要重新登录',
    [CodexRealtimeConnectionStatus.Offline]: '已离线',
    [CodexRealtimeConnectionStatus.Incompatible]: '协议不兼容',
    [CodexRealtimeConnectionStatus.Error]: '连接错误',
  }
  return labels[realtimeStore.status]
})

const statusLabel = (status: CodexHostStatus): string =>
  ({
    [CodexHostStatus.Enrolling]: '授权中',
    [CodexHostStatus.Online]: '在线',
    [CodexHostStatus.Offline]: '离线',
    [CodexHostStatus.Incompatible]: '不兼容',
    [CodexHostStatus.Revoked]: '已撤销',
  })[status]

const statusTone = (
  status: CodexHostStatus,
): 'neutral' | 'success' | 'warning' | 'danger' => {
  if (status === CodexHostStatus.Online) return 'success'
  if (status === CodexHostStatus.Incompatible) return 'warning'
  if (status === CodexHostStatus.Revoked) return 'danger'
  return 'neutral'
}

const compatibilityLabel = (state: CodexHostCompatibilityState): string =>
  ({
    [CodexHostCompatibilityState.Unknown]: '待检测',
    [CodexHostCompatibilityState.Compatible]: '兼容',
    [CodexHostCompatibilityState.ReadOnly]: '只读',
    [CodexHostCompatibilityState.UpgradeRequired]: '需要升级',
    [CodexHostCompatibilityState.Blocked]: '已阻断',
  })[state]

const compatibilityTone = (
  state: CodexHostCompatibilityState,
): 'neutral' | 'success' | 'warning' | 'danger' => {
  if (state === CodexHostCompatibilityState.Compatible) return 'success'
  if (state === CodexHostCompatibilityState.ReadOnly) return 'warning'
  if (state === CodexHostCompatibilityState.Unknown) return 'neutral'
  return 'danger'
}

const openAddDialog = () => {
  userCode.value = ''
  dialogMode.value = DialogMode.Add
}

const requestNotificationPermission = async (): Promise<void> => {
  if (readCodexBrowserNotificationPermission() === 'default') {
    notificationPermission.value =
      await requestCodexBrowserNotificationPermission()
  } else {
    notificationPermission.value =
      await refreshCodexBrowserNotificationPermission()
  }
}

const connectComputer = async (): Promise<void> => {
  connecting.value = true
  connectError.value = ''
  try {
    const enrollment = await new CodexEnrollmentClient().create()
    if (enrollment.detail.state !== CodexEnrollmentIntentState.Issued) {
      throw new Error('设备注册意图状态无效。')
    }
    const detail = enrollment.detail as CodexEnrollmentIntentIssuedDetail
    window.location.assign(detail.launch_uri)
    navigationTimer = setTimeout(() => {
      void navigateTo({
        path: '/codex/verify-device',
        query: { intent_id: enrollment.header.intent_id },
      })
    }, URI_HANDLER_NAVIGATION_DELAY_MS)
  } catch (error) {
    connectError.value =
      error instanceof Error ? error.message : '无法启动本机 Agent。'
  } finally {
    connecting.value = false
  }
}

const openRenameDialog = (host: CodexHost) => {
  selectedHost.value = host
  displayName.value = host.display_name
  renameError.value = ''
  dialogMode.value = DialogMode.Rename
}

const openRevokeDialog = (host: CodexHost) => {
  selectedHost.value = host
  password.value = ''
  renameError.value = ''
  revokeError.value = ''
  dialogMode.value = DialogMode.Revoke
}

const closeDialog = () => {
  if (dialogSubmitting.value) return
  dialogMode.value = DialogMode.Closed
  selectedHost.value = null
  password.value = ''
  renameError.value = ''
  revokeError.value = ''
}

const openVerification = async () => {
  const code = userCode.value.trim().toUpperCase()
  if (!code) return
  closeDialog()
  await navigateTo({ path: '/codex/verify-device', query: { user_code: code } })
}

const renameSelectedHost = async () => {
  if (!selectedHost.value || !displayName.value.trim()) return
  const selectedHostId = selectedHost.value.host_id
  dialogSubmitting.value = true
  renameError.value = ''
  try {
    await devicesStore.renameHost(selectedHost.value, displayName.value)
    dialogSubmitting.value = false
    closeDialog()
  } catch (error) {
    selectedHost.value =
      devicesStore.hosts.find((host) => host.host_id === selectedHostId) ??
      selectedHost.value
    const normalized = error as ApiErrorPayload
    renameError.value = normalized.message || '电脑重命名失败。'
  } finally {
    dialogSubmitting.value = false
  }
}

const revokeSelectedHost = async () => {
  if (!selectedHost.value || !password.value) return
  dialogSubmitting.value = true
  try {
    await devicesStore.revokeHost(selectedHost.value, password.value)
    dialogSubmitting.value = false
    closeDialog()
  } catch (error) {
    const normalized = error as ApiErrorPayload
    revokeError.value = normalized.message || '撤销电脑失败。'
  } finally {
    dialogSubmitting.value = false
  }
}

const activateComputer = async (host: CodexHost) => {
  if (activatingHostId.value) return
  activatingHostId.value = host.host_id
  connectError.value = ''
  try {
    await sessionStore.selectHost(host.host_id)
    await navigateTo(
      buildCodexTasksRoute({
        hostId: host.host_id,
        workspaceId: sessionStore.selectedWorkspaceId ?? undefined,
      }),
    )
  } catch (error) {
    connectError.value =
      (error as ApiErrorPayload).message || '启用电脑失败，请重试。'
  } finally {
    activatingHostId.value = null
  }
}

onMounted(async () => {
  await devicesStore.loadHosts()
})

onBeforeUnmount(() => {
  if (navigationTimer !== null) clearTimeout(navigationTimer)
})
</script>
