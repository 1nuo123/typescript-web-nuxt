<template>
  <PageContainer
    eyebrow="运维"
    title="日志查询"
    description="运行日志与安全事件都通过后端 admin_log 契约读取。"
  >
    <AppAlert
      v-if="message"
      :variant="messageVariant"
      title="日志查询"
      :description="message"
    />

    <AdminCard title="运行日志">
      <AdminToolbar>
        <BaseSelect v-model="level" label="级别" :options="LOG_LEVEL_OPTIONS" />
        <BaseSelect
          v-model="eventKind"
          label="事件类型"
          :options="LOG_EVENT_KIND_OPTIONS"
        />
        <BaseInput v-model="requestId" label="request_id" />
        <BaseInput v-model="traceId" label="trace_id" />
        <BaseButton :loading="loading" @click="loadLogs">查询日志</BaseButton>
        <BaseButton
          variant="secondary"
          :loading="loading"
          @click="loadSecurityEvents"
        >
          查询安全事件
        </BaseButton>
      </AdminToolbar>
      <AdminTable>
        <thead>
          <tr>
            <th>时间</th>
            <th>级别</th>
            <th>事件</th>
            <th>消息</th>
            <th>Trace</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="record in records" :key="record.event_id">
            <td>{{ record.occurred_at }}</td>
            <td>
              <BaseBadge :tone="logLevelTone(record.level)">
                {{ record.level }}
              </BaseBadge>
            </td>
            <td>{{ record.event_kind }}</td>
            <td>{{ record.message }}</td>
            <td class="font-mono text-xs break-words">
              {{ record.trace_id || '无' }}
            </td>
          </tr>
          <tr v-if="!records.length">
            <td colspan="5">暂无日志记录</td>
          </tr>
        </tbody>
      </AdminTable>
    </AdminCard>

    <AdminCard title="安全事件">
      <AdminTable>
        <thead>
          <tr>
            <th>时间</th>
            <th>类型</th>
            <th>级别</th>
            <th>决策</th>
            <th>IP 摘要</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="event in securityEvents" :key="event.event_id">
            <td>{{ event.occurred_at }}</td>
            <td>{{ event.security_event.header.event_type }}</td>
            <td>{{ event.security_event.header.severity }}</td>
            <td>{{ event.security_event.header.decision }}</td>
            <td class="font-mono text-xs break-words">
              {{ event.security_event.header.ip_digest || '无' }}
            </td>
          </tr>
          <tr v-if="!securityEvents.length">
            <td colspan="5">暂无安全事件</td>
          </tr>
        </tbody>
      </AdminTable>
    </AdminCard>
  </PageContainer>
</template>

<script setup lang="ts">
import type {
  AdminLogRecordPayload,
  AdminSecurityEventPayload,
} from '~/types/admin-ops'
import { LogEventKind, LogLevel } from '~/types/admin-ops'
import { AdminBoundaryPolicy, AuthRole, AuthScope } from '~/types/auth'
import { LOGIN_ROUTE } from '~/types/routes'
import { RuntimeFeatureFlag } from '~/types/app'

const LOGS_PAGE_TITLE = '日志查询'
const LOG_LEVEL_OPTIONS = [
  { value: '', label: '全部级别' },
  ...Object.values(LogLevel).map((value) => ({ value, label: value })),
]
const LOG_EVENT_KIND_OPTIONS = [
  { value: '', label: '全部事件' },
  ...Object.values(LogEventKind).map((value) => ({ value, label: value })),
]

definePageMeta({
  title: LOGS_PAGE_TITLE,
  requiresAuth: true,
  redirectTo: LOGIN_ROUTE,
  requiredRoles: [AuthRole.Admin],
  requiredScopes: [AuthScope.SystemRead],
  adminBoundaryPolicy: AdminBoundaryPolicy.OpsOnly,
  requiredRuntimeFlag: RuntimeFeatureFlag.AdminOps,
})

const client = createAdminOpsClient()
const records = ref<AdminLogRecordPayload[]>([])
const securityEvents = ref<AdminSecurityEventPayload[]>([])
const level = ref('')
const eventKind = ref('')
const requestId = ref('')
const traceId = ref('')
const loading = ref(false)
const message = ref('')
const messageVariant = ref<'info' | 'success' | 'warning' | 'danger'>('info')

const logLevelTone = (recordLevel: LogLevel) => {
  if (recordLevel === LogLevel.Error || recordLevel === LogLevel.Critical) {
    return 'danger'
  }

  if (recordLevel === LogLevel.Warning) {
    return 'warning'
  }

  return 'neutral'
}

const showError = (error: unknown) => {
  const normalized = error as { message?: string }

  message.value = normalized.message || '日志接口调用失败。'
  messageVariant.value = 'danger'
}

const loadLogs = async () => {
  loading.value = true

  try {
    const result = await client.logs.records({
      level: level.value as LogLevel | '',
      event_kind: eventKind.value as LogEventKind | '',
      request_id: requestId.value,
      trace_id: traceId.value,
    })
    records.value = result.records
    message.value = `读取 ${records.value.length} 条日志。`
    messageVariant.value = 'info'
  } catch (error) {
    showError(error)
  } finally {
    loading.value = false
  }
}

const loadSecurityEvents = async () => {
  loading.value = true

  try {
    const result = await client.logs.securityEvents()
    securityEvents.value = result.events
    message.value = `读取 ${securityEvents.value.length} 条安全事件。`
    messageVariant.value = 'info'
  } catch (error) {
    showError(error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadLogs()
})
</script>
