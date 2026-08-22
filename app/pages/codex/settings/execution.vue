<template>
  <section
    class="mx-auto grid h-full w-full min-w-0 max-w-3xl grid-rows-[auto_auto_minmax(0,1fr)] gap-6 overflow-y-auto p-4 sm:p-6"
  >
    <CodexMobilePageHeader title="运行设置" />

    <header class="border-b border-line pb-5">
      <h1 class="m-0 text-xl font-semibold">运行设置</h1>
      <p class="mt-1 mb-0 text-sm text-ink-muted">
        {{ workspaceLabel }}
      </p>
    </header>

    <div class="grid content-start gap-5">
      <BaseLoading v-if="loading" label="正在读取运行设置" />
      <AppAlert
        v-else-if="pageError"
        variant="danger"
        title="运行设置不可用"
        :description="pageError"
      />
      <template v-else-if="draft">
        <AppAlert
          v-if="adjustedFields.length"
          variant="warning"
          title="设置已按当前权限调整"
          :description="adjustedFieldLabel"
        />

        <div class="grid gap-4">
          <BaseSelect
            v-if="modelOptions.length"
            :model-value="draft.model || ''"
            label="模型"
            :options="modelOptions"
            @update:model-value="draft.model = $event || null"
          />
          <BaseSelect
            v-if="reasoningOptions.length"
            :model-value="draft.reasoning_effort || ''"
            label="推理强度"
            :options="reasoningOptions"
            @update:model-value="draft.reasoning_effort = $event || null"
          />
          <BaseSelect
            :model-value="draft.sandbox_mode"
            label="沙箱"
            :options="sandboxOptions"
            @update:model-value="
              draft.sandbox_mode = $event as CodexSandboxMode
            "
          />
          <BaseSelect
            :model-value="draft.approval_policy"
            label="审批策略"
            :options="approvalOptions"
            @update:model-value="
              draft.approval_policy = $event as CodexApprovalPolicy
            "
          />
        </div>

        <AppAlert
          v-if="saveError"
          variant="danger"
          title="保存失败"
          :description="saveError"
        />
        <p
          v-else-if="saveSuccess"
          class="m-0 text-sm text-success"
          aria-live="polite"
        >
          运行设置已保存。
        </p>

        <div class="flex justify-end border-t border-line pt-4">
          <BaseButton :loading="saving" @click="savePreferences">
            保存运行设置
          </BaseButton>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { AuthScope } from '~/types/auth'
import { RuntimeFeatureFlag } from '~/types/app'
import {
  CODEX_APPROVAL_RESTRICTION_ORDER,
  CODEX_SANDBOX_RESTRICTION_ORDER,
  CodexSandboxMode,
} from '~/types/codex-host'
import type { CodexApprovalPolicy } from '~/types/codex-host'
import { LOGIN_ROUTE } from '~/types/routes'
import type {
  CodexWorkspaceExecutionPreferencesResult,
  CodexWorkspaceExecutionPreferencesUpdate,
  CodexWorkspacePreferenceAdjustedField,
} from '~/types/codex-workspace'

definePageMeta({
  layout: 'codex',
  requiresAuth: true,
  redirectTo: LOGIN_ROUTE,
  requiredScopes: [AuthScope.CodexOperate],
  requiredRuntimeFlag: RuntimeFeatureFlag.Codex,
  title: 'Codex 运行设置',
})

const route = useRoute()
const authStore = useAuthStore()
const sessionStore = useCodexSessionStore()
const loading = ref(true)
const saving = ref(false)
const pageError = ref('')
const saveError = ref('')
const saveSuccess = ref(false)
const adjustedFields = ref<CodexWorkspacePreferenceAdjustedField[]>([])
const draft = ref<CodexWorkspaceExecutionPreferencesUpdate | null>(null)

const routeHostId = computed(() =>
  typeof route.query.hostId === 'string' ? route.query.hostId : undefined,
)
const routeWorkspaceId = computed(() =>
  typeof route.query.workspaceId === 'string'
    ? route.query.workspaceId
    : undefined,
)
const workspaceLabel = computed(() => {
  const workspace = sessionStore.selectedWorkspace
  const host = sessionStore.selectedHost
  if (!workspace || !host) return '正在定位项目'
  return `${host.display_name} · ${workspace.display_name}`
})
const modelOptions = computed(() => [
  { value: '', label: '使用主机默认模型' },
  ...(sessionStore.selectedHost?.capabilities.model_ids ?? []).map((value) => ({
    value,
    label: value,
  })),
])
const reasoningOptions = computed(() => [
  { value: '', label: '使用主机默认推理强度' },
  ...(sessionStore.selectedHost?.capabilities.reasoning_efforts ?? []).map(
    (value) => ({ value, label: value }),
  ),
])
const sandboxOptions = computed(() =>
  CODEX_SANDBOX_RESTRICTION_ORDER.filter((mode) => {
    const supported = Boolean(
      sessionStore.selectedHost?.capabilities.sandbox_modes.includes(mode),
    )
    return (
      supported &&
      (mode !== CodexSandboxMode.DangerFullAccess ||
        authStore.canScope(AuthScope.CodexFullAccess))
    )
  }).map((value) => ({ value, label: value })),
)
const approvalOptions = computed(() =>
  CODEX_APPROVAL_RESTRICTION_ORDER.filter((policy) =>
    Boolean(
      sessionStore.selectedHost?.capabilities.approval_policies.includes(
        policy,
      ),
    ),
  ).map((value) => ({ value, label: value })),
)
const adjustedFieldLabel = computed(() =>
  adjustedFields.value
    .map(
      (field) =>
        ({
          model: '模型',
          reasoning_effort: '推理强度',
          sandbox_mode: '沙箱',
          approval_policy: '审批策略',
          capabilities_revision: '主机能力版本',
        })[field],
    )
    .join('、'),
)

const applyResult = (
  result: CodexWorkspaceExecutionPreferencesResult,
): void => {
  draft.value = {
    model: result.effective_preferences.model,
    reasoning_effort: result.effective_preferences.reasoning_effort,
    sandbox_mode: result.effective_preferences.sandbox_mode,
    approval_policy: result.effective_preferences.approval_policy,
  }
  adjustedFields.value = result.adjusted_fields
}

const loadPreferences = async (): Promise<void> => {
  loading.value = true
  pageError.value = ''
  try {
    const restored = await sessionStore.restoreRouteSelection({
      hostId: routeHostId.value,
      workspaceId: routeWorkspaceId.value,
    })
    if (!restored) {
      throw new Error(sessionStore.selectionError ?? '项目权威归属恢复失败。')
    }
    const result = await sessionStore.loadWorkspaceExecutionPreferences()
    if (!result) throw new Error('运行设置在切换项目时失效，请重新打开设置。')
    applyResult(result)
  } catch (error) {
    pageError.value =
      error instanceof Error ? error.message : '读取运行设置失败。'
  } finally {
    loading.value = false
  }
}

const savePreferences = async (): Promise<void> => {
  if (!draft.value) return
  saving.value = true
  saveError.value = ''
  saveSuccess.value = false
  try {
    const result = await sessionStore.updateWorkspaceExecutionPreferences(
      draft.value,
    )
    applyResult(result)
    saveSuccess.value = true
  } catch (error) {
    saveError.value =
      error instanceof Error ? error.message : '保存运行设置失败。'
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void loadPreferences()
})
</script>
