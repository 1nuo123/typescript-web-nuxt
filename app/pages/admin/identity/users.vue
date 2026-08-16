<template>
  <PageContainer
    eyebrow="身份管理"
    title="管理员用户"
    description="用户列表、角色与直接 scope、启停及密码重置按后端身份接口闭环。"
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
          v-model="activeFilter"
          label="启用状态"
          :options="STATUS_FILTER_OPTIONS"
        />
        <BaseButton :loading="loading" @click="searchUsers">查询</BaseButton>
      </AdminToolbar>
    </AdminCard>

    <AdminCard v-if="canManage" title="创建用户">
      <AdminToolbar>
        <BaseInput v-model="createUsername" label="用户名" />
        <BaseInput v-model="createPassword" label="密码" type="password" />
        <BaseInput v-model="createRoleKeys" label="角色 keys" hint="逗号分隔" />
        <BaseButton :loading="saving" @click="createUser">创建</BaseButton>
      </AdminToolbar>
    </AdminCard>

    <AdminCard title="用户列表">
      <AdminTable>
        <thead>
          <tr>
            <th>用户名</th>
            <th>主体</th>
            <th>状态</th>
            <th>角色</th>
            <th>直接 scopes</th>
            <th>最终 scopes</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.subject_id">
            <td>{{ user.username }}</td>
            <td class="font-mono text-xs break-words">
              {{ user.subject_id }}
            </td>
            <td>
              <BaseBadge :tone="user.is_active ? 'success' : 'danger'">
                {{ user.is_active ? '启用' : '停用' }}
              </BaseBadge>
            </td>
            <td>{{ user.role_keys.join(', ') || '无' }}</td>
            <td>{{ user.direct_scope_codes.join(', ') || '无' }}</td>
            <td>{{ user.effective_scope_codes.join(', ') || '无' }}</td>
            <td>
              <div class="flex flex-wrap gap-2">
                <BaseButton
                  size="sm"
                  variant="secondary"
                  @click="selectUser(user)"
                >
                  选择
                </BaseButton>
                <BaseButton
                  v-if="canManage && user.is_active"
                  size="sm"
                  variant="danger"
                  @click="disableUser(user.subject_id)"
                >
                  停用
                </BaseButton>
                <BaseButton
                  v-if="canManage && !user.is_active"
                  size="sm"
                  variant="secondary"
                  @click="enableUser(user.subject_id)"
                >
                  启用
                </BaseButton>
              </div>
            </td>
          </tr>
          <tr v-if="!users.length">
            <td colspan="7">暂无用户记录</td>
          </tr>
        </tbody>
      </AdminTable>
      <AdminPagination
        :total="total"
        :page-size="ADMIN_IDENTITY_DEFAULT_PAGE_SIZE"
        :offset="offset"
        :disabled="loading"
        @change="changePage"
      />
    </AdminCard>

    <AdminCard
      v-if="selectedUser && canManage"
      :title="`维护用户：${selectedUser.username}`"
    >
      <AdminToolbar>
        <BaseInput v-model="editUsername" label="新用户名" />
        <BaseButton :loading="saving" @click="updateUser"
          >更新用户名</BaseButton
        >
        <BaseInput
          v-model="resetPasswordValue"
          label="新密码"
          type="password"
        />
        <BaseButton :loading="saving" @click="resetPassword"
          >重置密码</BaseButton
        >
        <BaseInput
          v-model="statusReason"
          label="启停原因"
          hint="停用为必填,1~256 字符"
        />
      </AdminToolbar>
      <AdminToolbar>
        <BaseInput v-model="editRoleKeys" label="角色 keys" hint="逗号分隔" />
        <BaseInput
          v-model="roleReplaceConfirmation"
          label="高危确认短语"
          :hint="`角色替换属高危授权变更,须输入 ${ADMIN_IDENTITY_GRANT_CONFIRMATION_PHRASE}`"
        />
        <BaseButton :loading="saving" @click="replaceRoles"
          >替换角色</BaseButton
        >
      </AdminToolbar>
      <AdminToolbar>
        <BaseInput
          v-model="editScopeCodes"
          label="直接 scopes"
          hint="逗号分隔；最终 scopes 同时包含角色授权"
        />
        <BaseInput
          v-model="scopeReplaceConfirmation"
          label="高危确认短语"
          :hint="`直接 scope 替换属高危授权变更,须输入 ${ADMIN_IDENTITY_GRANT_CONFIRMATION_PHRASE}`"
        />
        <BaseButton :loading="saving" @click="replaceScopes"
          >替换直接 scopes</BaseButton
        >
      </AdminToolbar>
    </AdminCard>
  </PageContainer>
</template>

<script setup lang="ts">
import type { AdminUserPayload } from '~/types/admin-identity'
import {
  ADMIN_IDENTITY_DEFAULT_PAGE_SIZE,
  ADMIN_IDENTITY_GRANT_CONFIRMATION_PHRASE,
} from '~/types/admin-identity'
import { AdminBoundaryPolicy, AuthRole, AuthScope } from '~/types/auth'
import { LOGIN_ROUTE } from '~/types/routes'

const USERS_PAGE_TITLE = '管理员用户'
const STATUS_ACTIVE_VALUE = 'true'
const STATUS_INACTIVE_VALUE = 'false'
const DEFAULT_STATUS_REASON = 'frontend.admin.identity.user_status_change'
const STATUS_FILTER_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: STATUS_ACTIVE_VALUE, label: '启用' },
  { value: STATUS_INACTIVE_VALUE, label: '停用' },
]

definePageMeta({
  title: USERS_PAGE_TITLE,
  requiresAuth: true,
  redirectTo: LOGIN_ROUTE,
  requiredRoles: [AuthRole.Admin],
  requiredScopes: [AuthScope.AuthRead],
  adminBoundaryPolicy: AdminBoundaryPolicy.BusinessAdmin,
})

const authStore = useAuthStore()
const client = createAdminIdentityClient()
const users = ref<AdminUserPayload[]>([])
const selectedUser = ref<AdminUserPayload | null>(null)
const keyword = ref('')
const activeFilter = ref('')
const createUsername = ref('')
const createPassword = ref('')
const createRoleKeys = ref('')
const editUsername = ref('')
const editRoleKeys = ref('')
const editScopeCodes = ref('')
const roleReplaceConfirmation = ref('')
const scopeReplaceConfirmation = ref('')
const resetPasswordValue = ref('')
const statusReason = ref(DEFAULT_STATUS_REASON)
const total = ref(0)
const offset = ref(0)
const loading = ref(false)
const saving = ref(false)
const message = ref('')
const messageVariant = ref<'info' | 'success' | 'warning' | 'danger'>('info')

const canManage = computed(() => authStore.canScope(AuthScope.AuthManage))

const activeQuery = computed(() => {
  if (activeFilter.value === STATUS_ACTIVE_VALUE) {
    return true
  }

  if (activeFilter.value === STATUS_INACTIVE_VALUE) {
    return false
  }

  return undefined
})

const roleKeysFromText = (value: string) => {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

const scopeCodesFromText = (value: string) => {
  return [...new Set(roleKeysFromText(value))]
}

const showSuccess = (nextMessage: string) => {
  message.value = nextMessage
  messageVariant.value = 'success'
}

const showError = (error: unknown) => {
  const normalized = error as { message?: string }

  message.value = normalized.message || '用户接口调用失败。'
  messageVariant.value = 'danger'
}

const loadUsers = async () => {
  loading.value = true

  try {
    const page = await client.users.list({
      keyword: keyword.value,
      is_active: activeQuery.value,
      offset: offset.value,
    })
    users.value = page.users
    total.value = page.total
  } catch (error) {
    showError(error)
  } finally {
    loading.value = false
  }
}

const searchUsers = async () => {
  offset.value = 0
  await loadUsers()
}

const changePage = async (nextOffset: number) => {
  offset.value = nextOffset
  await loadUsers()
}

const createUser = async () => {
  saving.value = true

  try {
    await client.users.create({
      username: createUsername.value,
      password: createPassword.value,
      role_keys: roleKeysFromText(createRoleKeys.value),
      subject_id: null,
    })
    createUsername.value = ''
    createPassword.value = ''
    createRoleKeys.value = ''
    showSuccess('用户已创建。')
    await loadUsers()
  } catch (error) {
    showError(error)
  } finally {
    saving.value = false
  }
}

const selectUser = (user: AdminUserPayload) => {
  selectedUser.value = user
  editUsername.value = user.username
  editRoleKeys.value = user.role_keys.join(', ')
  editScopeCodes.value = user.direct_scope_codes.join(', ')
  roleReplaceConfirmation.value = ''
  scopeReplaceConfirmation.value = ''
  resetPasswordValue.value = ''
}

const updateUser = async () => {
  if (!selectedUser.value) {
    return
  }

  saving.value = true

  try {
    await client.users.update(selectedUser.value.subject_id, {
      username: editUsername.value || null,
    })
    showSuccess('用户已更新。')
    await loadUsers()
  } catch (error) {
    showError(error)
  } finally {
    saving.value = false
  }
}

const replaceRoles = async () => {
  if (!selectedUser.value) {
    return
  }

  saving.value = true

  try {
    await client.users.replaceRoles(selectedUser.value.subject_id, {
      role_keys: roleKeysFromText(editRoleKeys.value),
      confirmation: roleReplaceConfirmation.value,
    })
    roleReplaceConfirmation.value = ''
    showSuccess('用户角色已替换。')
    await loadUsers()
  } catch (error) {
    showError(error)
  } finally {
    saving.value = false
  }
}

const replaceScopes = async () => {
  if (!selectedUser.value) {
    return
  }

  saving.value = true

  try {
    const updated = await client.users.replaceScopes(
      selectedUser.value.subject_id,
      {
        scope_codes: scopeCodesFromText(editScopeCodes.value),
        confirmation: scopeReplaceConfirmation.value,
      },
    )
    selectedUser.value = updated
    editScopeCodes.value = updated.direct_scope_codes.join(', ')
    scopeReplaceConfirmation.value = ''
    showSuccess('用户直接 scopes 已替换。')
    await loadUsers()
  } catch (error) {
    showError(error)
  } finally {
    saving.value = false
  }
}

const resetPassword = async () => {
  if (!selectedUser.value) {
    return
  }

  saving.value = true

  try {
    await client.users.resetPassword(selectedUser.value.subject_id, {
      password: resetPasswordValue.value,
    })
    resetPasswordValue.value = ''
    showSuccess('密码已重置。')
  } catch (error) {
    showError(error)
  } finally {
    saving.value = false
  }
}

const disableUser = async (subjectId: string) => {
  saving.value = true

  try {
    await client.users.disable(subjectId, {
      reason: statusReason.value || DEFAULT_STATUS_REASON,
    })
    showSuccess('用户已停用。')
    await loadUsers()
  } catch (error) {
    showError(error)
  } finally {
    saving.value = false
  }
}

const enableUser = async (subjectId: string) => {
  saving.value = true

  try {
    await client.users.enable(subjectId, {
      reason: statusReason.value || DEFAULT_STATUS_REASON,
    })
    showSuccess('用户已启用。')
    await loadUsers()
  } catch (error) {
    showError(error)
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void loadUsers()
})
</script>
