<template>
  <PageContainer
    eyebrow="运维"
    title="系统概览"
    description="系统信息与健康探针分别来自受保护系统接口和健康探针接口。"
  >
    <AppAlert
      v-if="message"
      :variant="messageVariant"
      title="系统概览"
      :description="message"
    />

    <section
      class="grid grid-cols-1 gap-4 lg:grid-cols-12"
      aria-label="系统状态"
    >
      <AdminCard tag="article" :span="4" title="系统">
        <p class="m-0 text-sm leading-relaxed text-ink-muted">
          应用：{{ info?.application_name || '未读取' }}
        </p>
        <p class="m-0 text-sm leading-relaxed text-ink-muted">
          版本：{{ info?.version || '未知' }} / 环境：{{
            info?.environment || '未知'
          }}
        </p>
        <p class="m-0 text-sm leading-relaxed text-ink-muted">
          启用模块：{{ info?.enabled_modules.join(', ') || '未知' }}
        </p>
      </AdminCard>
      <AdminCard tag="article" :span="4" title="Live">
        <BaseBadge :tone="live?.ready ? 'success' : 'warning'">
          {{
            live
              ? `${live.status} / ${live.ready ? '正常' : '未就绪'}`
              : '未确认'
          }}
        </BaseBadge>
      </AdminCard>
      <AdminCard tag="article" :span="4" title="Ready">
        <BaseBadge :tone="ready?.ready ? 'success' : 'warning'">
          {{
            ready
              ? `${ready.status} / ${ready.ready ? '就绪' : '未就绪'}`
              : '未确认'
          }}
        </BaseBadge>
      </AdminCard>
    </section>

    <AdminCard title="资源状态">
      <AdminTable>
        <thead>
          <tr>
            <th>资源</th>
            <th>状态</th>
            <th>详情</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="resource in info?.resources ?? []"
            :key="resource.resource_name"
          >
            <td>{{ resource.resource_name }}</td>
            <td>
              <BaseBadge
                :tone="
                  resource.status === RuntimeResourceStatus.Ready
                    ? 'success'
                    : resource.status === RuntimeResourceStatus.Failed
                      ? 'danger'
                      : 'neutral'
                "
              >
                {{ resource.status }}
              </BaseBadge>
            </td>
            <td>{{ resource.detail || '无' }}</td>
          </tr>
          <tr v-if="!info?.resources.length">
            <td colspan="3">暂无资源状态</td>
          </tr>
        </tbody>
      </AdminTable>
    </AdminCard>

    <AdminCard title="操作">
      <div class="flex flex-wrap gap-2">
        <BaseButton :loading="loading" @click="loadSystem">
          刷新系统信息
        </BaseButton>
        <BaseButton variant="secondary" :loading="loading" @click="loadHealth">
          刷新健康探针
        </BaseButton>
      </div>
    </AdminCard>
  </PageContainer>
</template>

<script setup lang="ts">
import type {
  HealthProbePayload,
  SystemOverviewAdminPayload,
} from '~/types/admin-ops'
import { RuntimeResourceStatus } from '~/types/admin-ops'
import { AdminBoundaryPolicy, AuthRole, AuthScope } from '~/types/auth'
import { LOGIN_ROUTE } from '~/types/routes'
import { RuntimeFeatureFlag } from '~/types/app'

const SYSTEM_PAGE_TITLE = '系统概览'

definePageMeta({
  title: SYSTEM_PAGE_TITLE,
  requiresAuth: true,
  redirectTo: LOGIN_ROUTE,
  requiredRoles: [AuthRole.Admin],
  requiredScopes: [AuthScope.SystemRead],
  adminBoundaryPolicy: AdminBoundaryPolicy.OpsOnly,
  requiredRuntimeFlag: RuntimeFeatureFlag.AdminOps,
})

const client = createAdminOpsClient()
const info = ref<SystemOverviewAdminPayload | null>(null)
const live = ref<HealthProbePayload | null>(null)
const ready = ref<HealthProbePayload | null>(null)
const loading = ref(false)
const message = ref('')
const messageVariant = ref<'info' | 'success' | 'warning' | 'danger'>('info')

const showError = (error: unknown) => {
  const normalized = error as { message?: string }

  message.value = normalized.message || '系统接口调用失败。'
  messageVariant.value = 'danger'
}

const loadSystem = async () => {
  loading.value = true

  try {
    info.value = await client.systemOverview.info()
    message.value = '系统信息已刷新。'
    messageVariant.value = 'info'
  } catch (error) {
    showError(error)
  } finally {
    loading.value = false
  }
}

const loadHealth = async () => {
  loading.value = true

  try {
    live.value = await client.systemOverview.live()
    ready.value = await client.systemOverview.ready()
    message.value = '健康探针已刷新。'
    messageVariant.value = 'info'
  } catch (error) {
    showError(error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadSystem()
  void loadHealth()
})
</script>
