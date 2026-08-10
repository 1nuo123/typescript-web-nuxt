<template>
  <PageContainer
    eyebrow="身份管理"
    title="角色管理"
    description="角色查询、创建、更新与 scope 替换使用身份管理强类型信封。"
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
        <BaseButton :loading="loading" @click="searchRoles">
          查询角色
        </BaseButton>
      </AdminToolbar>
    </AdminCard>

    <AdminCard v-if="canManage" title="保存角色">
      <AdminToolbar>
        <BaseInput v-model="roleKey" label="角色 key" />
        <BaseInput v-model="roleName" label="角色名称" />
        <BaseInput v-model="scopeCodes" label="scope codes" hint="逗号分隔" />
        <BaseInput
          v-model="grantConfirmation"
          label="高危确认短语"
          :hint="`涉及受保护 scope 或替换 scope 时,须输入 ${ADMIN_IDENTITY_GRANT_CONFIRMATION_PHRASE}`"
        />
      </AdminToolbar>
      <div class="flex flex-wrap gap-2">
        <BaseButton :loading="saving" @click="createRole">创建</BaseButton>
        <BaseButton variant="secondary" :loading="saving" @click="updateRole">
          更新
        </BaseButton>
        <BaseButton
          variant="secondary"
          :loading="saving"
          @click="replaceScopes"
        >
          替换 scope
        </BaseButton>
      </div>
    </AdminCard>

    <AdminCard title="角色列表">
      <AdminTable>
        <thead>
          <tr>
            <th>角色 key</th>
            <th>名称</th>
            <th>Scope</th>
            <th>用户数</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="role in roles" :key="role.role_key">
            <td class="font-mono text-xs break-words">{{ role.role_key }}</td>
            <td>{{ role.role_name }}</td>
            <td>{{ roleScopeText(role) }}</td>
            <td>{{ roleUserCountText(role) }}</td>
            <td>
              <div class="flex flex-wrap gap-2">
                <BaseButton
                  size="sm"
                  variant="secondary"
                  @click="selectRole(role)"
                >
                  选择
                </BaseButton>
                <BaseButton
                  v-if="canManage"
                  size="sm"
                  variant="danger"
                  @click="deleteRole(role.role_key)"
                >
                  删除
                </BaseButton>
              </div>
            </td>
          </tr>
          <tr v-if="!roles.length">
            <td colspan="5">暂无角色记录</td>
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

    <AdminCard title="业务角色只读列表">
      <AdminToolbar>
        <BaseButton
          variant="secondary"
          :loading="businessRolesLoading"
          @click="loadBusinessRoles"
        >
          查询业务角色
        </BaseButton>
      </AdminToolbar>
      <AdminTable>
        <thead>
          <tr>
            <th>业务角色 key</th>
            <th>名称</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="role in businessRoles" :key="role.role_key">
            <td class="font-mono text-xs break-words">{{ role.role_key }}</td>
            <td>{{ role.role_name }}</td>
          </tr>
          <tr v-if="!businessRoles.length">
            <td colspan="2">暂无业务角色记录</td>
          </tr>
        </tbody>
      </AdminTable>
    </AdminCard>
  </PageContainer>
</template>

<script setup lang="ts">
import type {
  AdminBusinessRolePayload,
  AdminRolePayload,
} from '~/types/admin-identity'
import {
  ADMIN_IDENTITY_DEFAULT_PAGE_SIZE,
  ADMIN_IDENTITY_GRANT_CONFIRMATION_PHRASE,
} from '~/types/admin-identity'
import { AdminBoundaryPolicy, AuthRole, AuthScope } from '~/types/auth'
import { LOGIN_ROUTE } from '~/types/routes'

const ROLES_PAGE_TITLE = '角色管理'

definePageMeta({
  title: ROLES_PAGE_TITLE,
  requiresAuth: true,
  redirectTo: LOGIN_ROUTE,
  requiredRoles: [AuthRole.Admin],
  requiredScopes: [AuthScope.AuthRead],
  adminBoundaryPolicy: AdminBoundaryPolicy.BusinessAdmin,
})

const authStore = useAuthStore()
const client = createAdminIdentityClient()
const roles = ref<AdminRolePayload[]>([])
const businessRoles = ref<AdminBusinessRolePayload[]>([])
const keyword = ref('')
const roleKey = ref('')
const roleName = ref('')
const scopeCodes = ref('')
const grantConfirmation = ref('')
const total = ref(0)
const offset = ref(0)
const loading = ref(false)
const businessRolesLoading = ref(false)
const saving = ref(false)
const message = ref('')
const messageVariant = ref<'info' | 'success' | 'warning' | 'danger'>('info')

const canManage = computed(() => authStore.canScope(AuthScope.AuthManage))

const scopeCodesFromText = (value: string) => {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

const roleScopeText = (role: AdminRolePayload) =>
  role.scope_codes.length ? role.scope_codes.join(', ') : '无'

const roleUserCountText = (role: AdminRolePayload) => String(role.user_count)

const showSuccess = (nextMessage: string) => {
  message.value = nextMessage
  messageVariant.value = 'success'
}

const showError = (error: unknown) => {
  const normalized = error as { message?: string }

  message.value = normalized.message || '角色接口调用失败。'
  messageVariant.value = 'danger'
}

const loadRoles = async () => {
  loading.value = true

  try {
    const page = await client.roles.list({
      keyword: keyword.value,
      offset: offset.value,
    })
    roles.value = page.roles
    total.value = page.total
  } catch (error) {
    showError(error)
  } finally {
    loading.value = false
  }
}

const searchRoles = async () => {
  offset.value = 0
  await loadRoles()
}

const changePage = async (nextOffset: number) => {
  offset.value = nextOffset
  await loadRoles()
}

const loadBusinessRoles = async () => {
  businessRolesLoading.value = true

  try {
    const page = await client.businessRoles.list({ keyword: keyword.value })
    businessRoles.value = page.roles
  } catch (error) {
    showError(error)
  } finally {
    businessRolesLoading.value = false
  }
}

const createRole = async () => {
  saving.value = true

  try {
    await client.roles.create({
      role_key: roleKey.value,
      role_name: roleName.value,
      scope_codes: scopeCodesFromText(scopeCodes.value),
      confirmation: grantConfirmation.value || null,
    })
    showSuccess('角色已创建。')
    await loadRoles()
  } catch (error) {
    showError(error)
  } finally {
    saving.value = false
  }
}

const updateRole = async () => {
  saving.value = true

  try {
    await client.roles.update(roleKey.value, {
      role_name: roleName.value,
    })
    showSuccess('角色已更新。')
    await loadRoles()
  } catch (error) {
    showError(error)
  } finally {
    saving.value = false
  }
}

const replaceScopes = async () => {
  saving.value = true

  try {
    await client.roles.replaceScopes(roleKey.value, {
      scope_codes: scopeCodesFromText(scopeCodes.value),
      confirmation: grantConfirmation.value,
    })
    showSuccess('角色 scope 已替换。')
    await loadRoles()
  } catch (error) {
    showError(error)
  } finally {
    saving.value = false
  }
}

const deleteRole = async (nextRoleKey: string) => {
  saving.value = true

  try {
    await client.roles.delete(nextRoleKey)
    showSuccess('角色已删除。')
    await loadRoles()
  } catch (error) {
    showError(error)
  } finally {
    saving.value = false
  }
}

const selectRole = (role: AdminRolePayload) => {
  roleKey.value = role.role_key
  roleName.value = role.role_name
  scopeCodes.value = role.scope_codes.join(', ')
  grantConfirmation.value = ''
}

onMounted(() => {
  void loadRoles()
})
</script>
