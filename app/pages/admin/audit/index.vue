<template>
  <PageContainer
    eyebrow="业务后台"
    title="业务审计"
    description="审计查询使用后端 offset 分页，空过滤项不会发送到接口。"
  >
    <AppAlert
      v-if="message"
      :variant="messageVariant"
      title="查询结果"
      :description="message"
    />

    <AdminCard title="过滤">
      <AdminToolbar>
        <BaseInput v-model="actorSubjectId" label="操作人主体" />
        <BaseSelect
          v-model="action"
          label="动作"
          :options="AUDIT_ACTION_OPTIONS"
        />
        <BaseInput v-model="targetKind" label="目标类型" />
        <BaseInput v-model="targetId" label="目标标识" />
        <label class="base-field grid min-w-0 gap-1.5">
          <span class="text-[0.8125rem] font-semibold text-ink">开始时间</span>
          <input
            v-model="occurredFrom"
            class="min-h-10 w-full min-w-0 px-3 text-[0.9rem] transition-[border-color,box-shadow] outline-none hover:border-ink-muted/55 focus:border-primary focus:ring-[3px] focus:ring-primary/15"
            type="datetime-local"
          />
        </label>
        <label class="base-field grid min-w-0 gap-1.5">
          <span class="text-[0.8125rem] font-semibold text-ink">结束时间</span>
          <input
            v-model="occurredTo"
            class="min-h-10 w-full min-w-0 px-3 text-[0.9rem] transition-[border-color,box-shadow] outline-none hover:border-ink-muted/55 focus:border-primary focus:ring-[3px] focus:ring-primary/15"
            type="datetime-local"
          />
        </label>
        <BaseButton :loading="loading" @click="searchAuditEvents"
          >查询</BaseButton
        >
      </AdminToolbar>
    </AdminCard>

    <AdminCard title="审计事件">
      <AdminTable>
        <thead>
          <tr>
            <th>时间</th>
            <th>动作</th>
            <th>操作人</th>
            <th>目标</th>
            <th>结果</th>
            <th>摘要</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="event in events" :key="event.event_id">
            <td>{{ event.occurred_at }}</td>
            <td>{{ event.action }}</td>
            <td class="font-mono text-xs break-words">
              {{ event.actor_subject_id }}
            </td>
            <td class="font-mono text-xs break-words">
              {{ event.target_kind }}:{{ event.target_id }}
            </td>
            <td>
              <BaseBadge
                :tone="
                  event.result === AdminAuditResult.Success
                    ? 'success'
                    : 'danger'
                "
              >
                {{ event.result }}
              </BaseBadge>
            </td>
            <td>{{ event.summary }}</td>
          </tr>
          <tr v-if="!events.length">
            <td colspan="6">暂无审计事件</td>
          </tr>
        </tbody>
      </AdminTable>
      <AdminPagination
        :total="total"
        :page-size="ADMIN_AUDIT_DEFAULT_PAGE_SIZE"
        :offset="offset"
        :disabled="loading"
        @change="changePage"
      />
    </AdminCard>
  </PageContainer>
</template>

<script setup lang="ts">
import type { AdminAuditEventPayload } from '~/types/admin-audit'
import {
  ADMIN_AUDIT_DEFAULT_PAGE_SIZE,
  AdminAuditAction,
  AdminAuditResult,
} from '~/types/admin-audit'
import { AdminBoundaryPolicy, AuthRole, AuthScope } from '~/types/auth'
import { LOGIN_ROUTE } from '~/types/routes'

const AUDIT_PAGE_TITLE = '业务审计'
const DATE_TIME_LOCAL_SEPARATOR = 'T'
const ISO_TIME_SEPARATOR = 'T'
const AUDIT_ACTION_OPTIONS = [
  { value: '', label: '全部动作' },
  { value: AdminAuditAction.UserCreated, label: '用户创建' },
  { value: AdminAuditAction.UserUpdated, label: '用户更新' },
  { value: AdminAuditAction.UserDisabled, label: '用户停用' },
  { value: AdminAuditAction.UserEnabled, label: '用户启用' },
  { value: AdminAuditAction.PasswordReset, label: '密码重置' },
  { value: AdminAuditAction.RoleAssigned, label: '角色分配' },
]

definePageMeta({
  title: AUDIT_PAGE_TITLE,
  requiresAuth: true,
  redirectTo: LOGIN_ROUTE,
  requiredRoles: [AuthRole.Admin],
  requiredScopes: [AuthScope.AuthRead],
  adminBoundaryPolicy: AdminBoundaryPolicy.BusinessAdmin,
})

const client = createAdminAuditClient()
const events = ref<AdminAuditEventPayload[]>([])
const actorSubjectId = ref('')
const action = ref('')
const targetKind = ref('')
const targetId = ref('')
const occurredFrom = ref('')
const occurredTo = ref('')
const total = ref(0)
const offset = ref(0)
const loading = ref(false)
const message = ref('')
const messageVariant = ref<'info' | 'success' | 'warning' | 'danger'>('info')

const toIsoDateTime = (value: string) => {
  return value
    ? value.replace(DATE_TIME_LOCAL_SEPARATOR, ISO_TIME_SEPARATOR)
    : ''
}

const showError = (error: unknown) => {
  const normalized = error as { message?: string }

  message.value = normalized.message || '审计接口调用失败。'
  messageVariant.value = 'danger'
}

const loadAuditEvents = async () => {
  loading.value = true

  try {
    const page = await client.list({
      actor_subject_id: actorSubjectId.value,
      action: action.value as AdminAuditAction | '',
      target_kind: targetKind.value,
      target_id: targetId.value,
      occurred_from: toIsoDateTime(occurredFrom.value),
      occurred_to: toIsoDateTime(occurredTo.value),
      offset: offset.value,
    })
    events.value = page.events
    total.value = page.total
    message.value = `共 ${page.total} 条审计事件。`
    messageVariant.value = 'info'
  } catch (error) {
    showError(error)
  } finally {
    loading.value = false
  }
}

const searchAuditEvents = async () => {
  offset.value = 0
  await loadAuditEvents()
}

const changePage = async (nextOffset: number) => {
  offset.value = nextOffset
  await loadAuditEvents()
}

onMounted(() => {
  void loadAuditEvents()
})
</script>
