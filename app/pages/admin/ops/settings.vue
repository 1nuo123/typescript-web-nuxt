<template>
  <PageContainer
    eyebrow="运维"
    title="配置热更新"
    description="候选读取与执行结果均校验后端配置热更新信封。"
  >
    <AppAlert
      v-if="message"
      :variant="messageVariant"
      title="配置热更新"
      :description="message"
    />

    <section
      class="grid grid-cols-1 gap-4 lg:grid-cols-12"
      aria-label="配置热更新"
    >
      <AdminCard tag="article" :span="6" title="候选">
        <p class="m-0 text-sm leading-relaxed text-ink-muted">
          版本：{{ candidate?.candidate_version || '未读取' }}
        </p>
        <p
          class="m-0 font-mono text-xs leading-relaxed break-words text-ink-muted"
        >
          Digest：{{ candidate?.digest || '无' }}
        </p>
        <div>
          <BaseButton :loading="loading" @click="readCandidate">
            读取候选
          </BaseButton>
        </div>
      </AdminCard>

      <AdminCard tag="article" :span="6" title="执行">
        <p class="m-0 text-sm leading-relaxed text-ink-muted">
          {{
            result
              ? `成功：${result.success ? '是' : '否'} / 回滚：${result.rolled_back ? '是' : '否'}`
              : '未执行'
          }}
        </p>
        <p
          v-if="result?.reason"
          class="m-0 text-sm leading-relaxed text-ink-muted"
        >
          原因：{{ result.reason }}
        </p>
        <p
          v-if="!canApplyReload"
          class="m-0 text-sm leading-relaxed text-ink-muted"
        >
          当前账号缺少系统管理权限，无法执行配置热更新。
        </p>
        <div v-if="canApplyReload">
          <BaseButton variant="danger" :loading="saving" @click="applyReload">
            执行热更新
          </BaseButton>
        </div>
      </AdminCard>
    </section>
  </PageContainer>
</template>

<script setup lang="ts">
import type {
  AdminSettingsReloadCandidatePayload,
  AdminSettingsReloadResultPayload,
} from '~/types/admin-ops'
import { AdminBoundaryPolicy, AuthRole, AuthScope } from '~/types/auth'
import { LOGIN_ROUTE } from '~/types/routes'
import { RuntimeFeatureFlag } from '~/types/app'

const SETTINGS_PAGE_TITLE = '配置热更新'

definePageMeta({
  title: SETTINGS_PAGE_TITLE,
  requiresAuth: true,
  redirectTo: LOGIN_ROUTE,
  requiredRoles: [AuthRole.Admin],
  requiredScopes: [AuthScope.SystemRead],
  adminBoundaryPolicy: AdminBoundaryPolicy.OpsOnly,
  requiredRuntimeFlag: RuntimeFeatureFlag.AdminOps,
})

const client = createAdminOpsClient()
const authStore = useAuthStore()
const candidate = ref<AdminSettingsReloadCandidatePayload | null>(null)
const result = ref<AdminSettingsReloadResultPayload | null>(null)
const loading = ref(false)
const saving = ref(false)
const message = ref('')
const messageVariant = ref<'info' | 'success' | 'warning' | 'danger'>('info')

const canApplyReload = computed(() =>
  authStore.canScope(AuthScope.SystemManage),
)

const showError = (error: unknown) => {
  const normalized = error as { message?: string }

  message.value = normalized.message || '配置热更新接口调用失败。'
  messageVariant.value = 'danger'
}

const readCandidate = async () => {
  loading.value = true

  try {
    candidate.value = await client.settingsReload.candidate()
    message.value = '候选配置已读取。'
    messageVariant.value = 'info'
  } catch (error) {
    showError(error)
  } finally {
    loading.value = false
  }
}

const applyReload = async () => {
  if (!canApplyReload.value) {
    message.value = '当前账号缺少系统管理权限，无法执行配置热更新。'
    messageVariant.value = 'warning'
    return
  }

  saving.value = true

  try {
    result.value = await client.settingsReload.execute()
    message.value = result.value.success ? '热更新已执行。' : '热更新未成功。'
    messageVariant.value = result.value.success ? 'success' : 'warning'
  } catch (error) {
    showError(error)
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void readCandidate()
})
</script>
