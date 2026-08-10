<template>
  <PageContainer
    eyebrow="身份管理"
    title="Scope 管理"
    description="Scope 作为后台接口权限最小单元，读写均对齐后端身份契约。"
  >
    <AppAlert
      v-if="message"
      :variant="messageVariant"
      title="操作结果"
      :description="message"
    />

    <AdminCard title="查询">
      <AdminToolbar>
        <BaseInput v-model="keyword" label="关键字" />
        <BaseSelect
          v-model="enabledFilter"
          label="启用状态"
          :options="STATUS_FILTER_OPTIONS"
        />
        <BaseButton :loading="loading" @click="loadScopes">查询</BaseButton>
      </AdminToolbar>
    </AdminCard>

    <AdminCard v-if="canManage" title="保存 scope">
      <AdminToolbar>
        <BaseInput v-model="scopeCode" label="scope code" />
        <BaseInput v-model="scopeName" label="scope 名称" />
        <BaseInput v-model="description" label="描述" />
        <BaseSelect
          v-model="enabledValue"
          label="启用状态"
          :options="STATUS_VALUE_OPTIONS"
        />
        <BaseButton :loading="saving" @click="createScope">创建</BaseButton>
        <BaseButton variant="secondary" :loading="saving" @click="updateScope">
          更新
        </BaseButton>
      </AdminToolbar>
    </AdminCard>

    <AdminCard title="Scope 列表">
      <AdminTable>
        <thead>
          <tr>
            <th>Code</th>
            <th>名称</th>
            <th>状态</th>
            <th>类型</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="scope in scopes" :key="scope.scope_code">
            <td class="font-mono text-xs break-words">
              {{ scope.scope_code }}
            </td>
            <td>{{ scope.scope_name }}</td>
            <td>
              <BaseBadge :tone="scope.enabled ? 'success' : 'danger'">
                {{ scope.enabled ? '启用' : '停用' }}
              </BaseBadge>
            </td>
            <td>{{ scope.scope_kind || '默认' }}</td>
            <td>
              <div class="flex flex-wrap gap-2">
                <BaseButton
                  size="sm"
                  variant="secondary"
                  @click="selectScope(scope)"
                >
                  选择
                </BaseButton>
                <BaseButton
                  v-if="canManage"
                  size="sm"
                  variant="danger"
                  @click="deleteScope(scope.scope_code)"
                >
                  删除
                </BaseButton>
              </div>
            </td>
          </tr>
          <tr v-if="!scopes.length">
            <td colspan="5">暂无 scope 记录</td>
          </tr>
        </tbody>
      </AdminTable>
    </AdminCard>
  </PageContainer>
</template>

<script setup lang="ts">
import type { AdminScopePayload } from '~/types/admin-identity'
import { AdminBoundaryPolicy, AuthRole, AuthScope } from '~/types/auth'
import { LOGIN_ROUTE } from '~/types/routes'

const SCOPES_PAGE_TITLE = 'Scope 管理'
const STATUS_ACTIVE_VALUE = 'true'
const STATUS_INACTIVE_VALUE = 'false'
const STATUS_FILTER_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: STATUS_ACTIVE_VALUE, label: '启用' },
  { value: STATUS_INACTIVE_VALUE, label: '停用' },
]
const STATUS_VALUE_OPTIONS = [
  { value: STATUS_ACTIVE_VALUE, label: '启用' },
  { value: STATUS_INACTIVE_VALUE, label: '停用' },
]

definePageMeta({
  title: SCOPES_PAGE_TITLE,
  requiresAuth: true,
  redirectTo: LOGIN_ROUTE,
  requiredRoles: [AuthRole.Admin],
  requiredScopes: [AuthScope.AuthRead],
  adminBoundaryPolicy: AdminBoundaryPolicy.BusinessAdmin,
})

const authStore = useAuthStore()
const client = createAdminIdentityClient()
const scopes = ref<AdminScopePayload[]>([])
const keyword = ref('')
const enabledFilter = ref('')
const scopeCode = ref('')
const scopeName = ref('')
const description = ref('')
const enabledValue = ref(STATUS_ACTIVE_VALUE)
const loading = ref(false)
const saving = ref(false)
const message = ref('')
const messageVariant = ref<'info' | 'success' | 'warning' | 'danger'>('info')

const canManage = computed(() => authStore.canScope(AuthScope.AuthManage))

const enabledQuery = computed(() => {
  if (enabledFilter.value === STATUS_ACTIVE_VALUE) {
    return true
  }

  if (enabledFilter.value === STATUS_INACTIVE_VALUE) {
    return false
  }

  return undefined
})

const enabledBody = computed(() => enabledValue.value === STATUS_ACTIVE_VALUE)

const showSuccess = (nextMessage: string) => {
  message.value = nextMessage
  messageVariant.value = 'success'
}

const showError = (error: unknown) => {
  const normalized = error as { message?: string }

  message.value = normalized.message || 'Scope 接口调用失败。'
  messageVariant.value = 'danger'
}

const loadScopes = async () => {
  loading.value = true

  try {
    const result = await client.scopes.list({
      keyword: keyword.value,
      enabled: enabledQuery.value,
    })
    scopes.value = result.scopes
  } catch (error) {
    showError(error)
  } finally {
    loading.value = false
  }
}

const createScope = async () => {
  saving.value = true

  try {
    await client.scopes.create({
      scope_code: scopeCode.value,
      scope_name: scopeName.value,
      description: description.value || null,
      enabled: enabledBody.value,
    })
    showSuccess('Scope 已创建。')
    await loadScopes()
  } catch (error) {
    showError(error)
  } finally {
    saving.value = false
  }
}

const updateScope = async () => {
  saving.value = true

  try {
    await client.scopes.update(scopeCode.value, {
      scope_name: scopeName.value,
      description: description.value || null,
      enabled: enabledBody.value,
    })
    showSuccess('Scope 已更新。')
    await loadScopes()
  } catch (error) {
    showError(error)
  } finally {
    saving.value = false
  }
}

const deleteScope = async (nextScopeCode: string) => {
  saving.value = true

  try {
    await client.scopes.delete(nextScopeCode)
    showSuccess('Scope 已删除。')
    await loadScopes()
  } catch (error) {
    showError(error)
  } finally {
    saving.value = false
  }
}

const selectScope = (scope: AdminScopePayload) => {
  scopeCode.value = scope.scope_code
  scopeName.value = scope.scope_name
  description.value = scope.description || ''
  enabledValue.value = scope.enabled
    ? STATUS_ACTIVE_VALUE
    : STATUS_INACTIVE_VALUE
}

onMounted(() => {
  void loadScopes()
})
</script>
