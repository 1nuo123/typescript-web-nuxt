<template>
  <PageContainer
    eyebrow="运维"
    title="安全防护"
    description="IP 封禁接口不走 admin 子信封，只解析公共响应 data。"
  >
    <AppAlert
      v-if="message"
      :variant="messageVariant"
      title="安全防护"
      :description="message"
    />

    <AdminCard title="查询封禁">
      <AdminToolbar>
        <BaseInput v-model="status" label="状态" />
        <BaseInput v-model="ipDigestFilter" label="IP 摘要" />
        <BaseButton :loading="loading" @click="loadBlocks">查询</BaseButton>
      </AdminToolbar>
    </AdminCard>

    <AdminCard v-if="canManageSecurity" title="手动封禁">
      <AdminToolbar>
        <BaseInput v-model="ipDigest" label="IP 摘要" />
        <label class="base-field grid min-w-0 gap-1.5">
          <span class="text-[0.8125rem] font-semibold text-ink">封禁秒数</span>
          <input
            v-model.number="blockSeconds"
            class="min-h-10 w-full min-w-0 px-3 text-[0.9rem] transition-[border-color,box-shadow] outline-none hover:border-ink-muted/55 focus:border-primary focus:ring-[3px] focus:ring-primary/15"
            type="number"
            min="1"
          />
        </label>
        <BaseInput v-model="releaseReason" label="释放原因" />
        <BaseButton :loading="saving" @click="createBlock">封禁</BaseButton>
        <BaseButton variant="secondary" :loading="saving" @click="releaseBlock">
          释放
        </BaseButton>
      </AdminToolbar>
    </AdminCard>

    <AdminCard title="封禁记录">
      <AdminTable>
        <thead>
          <tr>
            <th>记录 ID</th>
            <th>IP 摘要</th>
            <th>状态</th>
            <th>原因</th>
            <th>截止 epoch</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="record in records" :key="record.record_id">
            <td class="font-mono text-xs break-words">
              {{ record.record_id }}
            </td>
            <td class="font-mono text-xs break-words">
              {{ record.ip_digest }}
            </td>
            <td>{{ record.status }}</td>
            <td>{{ record.reason }}</td>
            <td>{{ record.blocked_until_epoch }}</td>
          </tr>
          <tr v-if="!records.length">
            <td colspan="5">暂无封禁记录</td>
          </tr>
        </tbody>
      </AdminTable>
    </AdminCard>
  </PageContainer>
</template>

<script setup lang="ts">
import type { SecurityIpBlockRecordPayload } from '~/types/security-protection'
import { AdminBoundaryPolicy, AuthRole, AuthScope } from '~/types/auth'
import { LOGIN_ROUTE } from '~/types/routes'
import { RuntimeFeatureFlag } from '~/types/app'

const SECURITY_PAGE_TITLE = '安全防护'
const DEFAULT_BLOCK_SECONDS = 3600
const DEFAULT_RELEASE_REASON = 'frontend.admin.security.release'

definePageMeta({
  title: SECURITY_PAGE_TITLE,
  requiresAuth: true,
  redirectTo: LOGIN_ROUTE,
  requiredRoles: [AuthRole.Admin],
  requiredScopes: [AuthScope.SystemRead, AuthScope.SecurityManage],
  adminBoundaryPolicy: AdminBoundaryPolicy.OpsOnly,
  requiredRuntimeFlag: RuntimeFeatureFlag.AdminOps,
})

const authStore = useAuthStore()
const client = createAdminOpsClient()
const records = ref<SecurityIpBlockRecordPayload[]>([])
const status = ref('')
const ipDigestFilter = ref('')
const ipDigest = ref('')
const blockSeconds = ref(DEFAULT_BLOCK_SECONDS)
const releaseReason = ref(DEFAULT_RELEASE_REASON)
const loading = ref(false)
const saving = ref(false)
const message = ref('')
const messageVariant = ref<'info' | 'success' | 'warning' | 'danger'>('info')

const canManageSecurity = computed(() =>
  authStore.canScope(AuthScope.SecurityManage),
)

const showError = (error: unknown) => {
  const normalized = error as { message?: string }

  message.value = normalized.message || '安全防护接口调用失败。'
  messageVariant.value = 'danger'
}

const loadBlocks = async () => {
  loading.value = true

  try {
    const result = await client.security.list({
      status: status.value,
      ip_digest: ipDigestFilter.value,
    })
    records.value = result.records
  } catch (error) {
    showError(error)
  } finally {
    loading.value = false
  }
}

const createBlock = async () => {
  saving.value = true

  try {
    await client.security.create({
      ip_digest: ipDigest.value,
      block_seconds: blockSeconds.value,
    })
    message.value = 'IP 封禁已创建。'
    messageVariant.value = 'success'
    await loadBlocks()
  } catch (error) {
    showError(error)
  } finally {
    saving.value = false
  }
}

const releaseBlock = async () => {
  saving.value = true

  try {
    await client.security.release({
      ip_digest: ipDigest.value,
      released_reason: releaseReason.value,
    })
    message.value = 'IP 封禁已释放。'
    messageVariant.value = 'success'
    await loadBlocks()
  } catch (error) {
    showError(error)
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void loadBlocks()
})
</script>
