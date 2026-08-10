<template>
  <PageContainer
    eyebrow="运维"
    title="任务管理"
    description="任务查询使用 system:read，派发按钮额外要求 task:dispatch。"
  >
    <AppAlert
      v-if="message"
      :variant="messageVariant"
      title="任务接口"
      :description="message"
    />

    <section
      class="grid grid-cols-1 gap-4 lg:grid-cols-12"
      aria-label="任务状态"
    >
      <AdminCard tag="article" :span="6" title="运行时">
        <p class="m-0 text-sm leading-relaxed text-ink-muted">
          {{ runtimeSummary }}
        </p>
        <p v-if="runtime" class="m-0 text-sm leading-relaxed text-ink-muted">
          默认任务:{{ runtime.default_job_kind }} / 默认重试:{{
            runtime.default_retry_limit
          }}
          / Worker:{{ runtime.worker_enabled ? '启用' : '停用' }}
        </p>
        <div>
          <BaseButton :loading="loading" @click="loadRuntime">
            读取运行时
          </BaseButton>
        </div>
      </AdminCard>

      <AdminCard v-if="canDispatch" tag="article" :span="6" title="派发任务">
        <BaseInput v-model="jobKind" label="任务类型" />
        <label class="base-field grid min-w-0 gap-1.5">
          <span class="text-[0.8125rem] font-semibold text-ink"
            >任务 JSON payload</span
          >
          <textarea
            v-model="payloadJson"
            class="min-h-28 w-full min-w-0 resize-y rounded-md border border-line-strong bg-surface p-3 font-mono text-sm text-ink shadow-[0_1px_2px_rgb(18_24_33/0.04)] transition-[border-color,box-shadow] outline-none hover:border-ink-muted/55 focus:border-primary focus:ring-[3px] focus:ring-primary/15"
          />
        </label>
        <div>
          <BaseButton :loading="saving" @click="dispatchTask">派发</BaseButton>
        </div>
        <p
          v-if="dispatchResult"
          class="m-0 text-sm leading-relaxed text-ink-muted"
        >
          最近派发:<span class="font-mono text-xs">{{
            dispatchResult.task_id
          }}</span>
          / {{ dispatchResult.dispatched ? '已派发' : '未派发' }} /
          {{ dispatchResult.execution_status }} /
          {{ dispatchResult.backend }}:{{ dispatchResult.queue_name }}
        </p>
      </AdminCard>
    </section>

    <AdminCard title="执行记录">
      <AdminToolbar>
        <BaseSelect
          v-model="status"
          label="状态"
          :options="EXECUTION_STATUS_OPTIONS"
        />
        <BaseInput v-model="jobKindFilter" label="任务类型" />
        <BaseButton :loading="loading" @click="loadExecutions">查询</BaseButton>
        <BaseButton
          variant="secondary"
          :loading="loading"
          @click="loadRegistrations"
        >
          查询注册
        </BaseButton>
      </AdminToolbar>
      <AdminTable>
        <thead>
          <tr>
            <th>任务 ID</th>
            <th>类型</th>
            <th>状态</th>
            <th>阶段</th>
            <th>后端</th>
            <th>Trace</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="record in executions" :key="record.record_id">
            <td class="font-mono text-xs break-words">{{ record.task_id }}</td>
            <td>{{ record.job_kind }}</td>
            <td>
              <BaseBadge :tone="executionStatusTone(record.runtime.status)">
                {{ record.runtime.status }}
              </BaseBadge>
            </td>
            <td>{{ record.runtime.stage }}</td>
            <td>{{ record.backend }}:{{ record.queue_name }}</td>
            <td class="font-mono text-xs break-words">
              {{ record.trace_id || '无' }}
            </td>
          </tr>
          <tr v-if="!executions.length">
            <td colspan="6">暂无执行记录</td>
          </tr>
        </tbody>
      </AdminTable>
    </AdminCard>

    <AdminCard title="任务注册">
      <AdminTable>
        <thead>
          <tr>
            <th>任务名</th>
            <th>任务类型</th>
            <th>注册后端</th>
            <th>队列</th>
            <th>当前可用</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in registrations" :key="item.task_name">
            <td>{{ item.task_name }}</td>
            <td>{{ item.job_kind }}</td>
            <td>{{ item.registration_backend }}</td>
            <td>{{ item.queue_name || '无' }}</td>
            <td>
              <BaseBadge
                :tone="item.active_for_current_runtime ? 'success' : 'neutral'"
              >
                {{ item.active_for_current_runtime ? '是' : '否' }}
              </BaseBadge>
            </td>
          </tr>
          <tr v-if="!registrations.length">
            <td colspan="5">暂无注册记录</td>
          </tr>
        </tbody>
      </AdminTable>
    </AdminCard>
  </PageContainer>
</template>

<script setup lang="ts">
import type {
  AdminTaskDispatchResultPayload,
  AdminTaskExecutionRecordPayload,
  AdminTaskRegistrationPayload,
  AdminTaskRuntimePayload,
} from '~/types/admin-ops'
import { TaskExecutionStatus } from '~/types/admin-ops'
import { AdminBoundaryPolicy, AuthRole, AuthScope } from '~/types/auth'
import { LOGIN_ROUTE } from '~/types/routes'
import { RuntimeFeatureFlag } from '~/types/app'

const TASKS_PAGE_TITLE = '任务管理'
const DEFAULT_PAYLOAD_JSON = '{}'
const INVALID_PAYLOAD_JSON_MESSAGE = '任务 payload 必须是合法 JSON 文本。'
const EXECUTION_STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  ...Object.values(TaskExecutionStatus).map((value) => ({
    value,
    label: value,
  })),
]

definePageMeta({
  title: TASKS_PAGE_TITLE,
  requiresAuth: true,
  redirectTo: LOGIN_ROUTE,
  requiredRoles: [AuthRole.Admin],
  requiredScopes: [AuthScope.SystemRead],
  adminBoundaryPolicy: AdminBoundaryPolicy.OpsOnly,
  requiredRuntimeFlag: RuntimeFeatureFlag.AdminOps,
})

const authStore = useAuthStore()
const client = createAdminOpsClient()
const runtime = ref<AdminTaskRuntimePayload | null>(null)
const executions = ref<AdminTaskExecutionRecordPayload[]>([])
const registrations = ref<AdminTaskRegistrationPayload[]>([])
const dispatchResult = ref<AdminTaskDispatchResultPayload | null>(null)
const status = ref('')
const jobKindFilter = ref('')
const jobKind = ref('')
const payloadJson = ref(DEFAULT_PAYLOAD_JSON)
const loading = ref(false)
const saving = ref(false)
const message = ref('')
const messageVariant = ref<'info' | 'success' | 'warning' | 'danger'>('info')

const canDispatch = computed(() => authStore.canScope(AuthScope.TaskDispatch))

const runtimeSummary = computed(() => {
  if (!runtime.value) {
    return '未读取'
  }

  return `${runtime.value.task_backend} / ${runtime.value.task_runtime_mode} / 传输:${runtime.value.transport_backend}`
})

const executionStatusTone = (executionStatus: TaskExecutionStatus) => {
  if (executionStatus === TaskExecutionStatus.Success) {
    return 'success'
  }

  if (
    executionStatus === TaskExecutionStatus.Failed ||
    executionStatus === TaskExecutionStatus.Retrying
  ) {
    return 'danger'
  }

  return 'neutral'
}

const showError = (error: unknown) => {
  const normalized = error as { message?: string }

  message.value = normalized.message || '任务接口调用失败。'
  messageVariant.value = 'danger'
}

const loadRuntime = async () => {
  loading.value = true

  try {
    runtime.value = await client.tasks.runtime()
  } catch (error) {
    showError(error)
  } finally {
    loading.value = false
  }
}

const loadExecutions = async () => {
  loading.value = true

  try {
    const result = await client.tasks.executions({
      status: status.value as TaskExecutionStatus | '',
      job_kind: jobKindFilter.value,
    })
    executions.value = result.records
  } catch (error) {
    showError(error)
  } finally {
    loading.value = false
  }
}

const loadRegistrations = async () => {
  loading.value = true

  try {
    const result = await client.tasks.registrations()
    registrations.value = result.registrations
  } catch (error) {
    showError(error)
  } finally {
    loading.value = false
  }
}

const dispatchTask = async () => {
  try {
    JSON.parse(payloadJson.value)
  } catch {
    message.value = INVALID_PAYLOAD_JSON_MESSAGE
    messageVariant.value = 'warning'
    return
  }

  saving.value = true

  try {
    dispatchResult.value = await client.tasks.dispatch({
      job_kind: jobKind.value,
      payload_json: payloadJson.value,
    })
    message.value = dispatchResult.value.dispatched
      ? '任务已派发。'
      : '任务未派发,请检查派发结果。'
    messageVariant.value = dispatchResult.value.dispatched
      ? 'success'
      : 'warning'
    await loadExecutions()
  } catch (error) {
    showError(error)
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void loadRuntime()
  void loadExecutions()
})
</script>
