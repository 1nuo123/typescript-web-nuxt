<template>
  <section
    class="codex-page mx-auto grid h-full w-full min-w-0 max-w-3xl grid-rows-[auto_auto_minmax(0,1fr)] gap-6 overflow-y-auto p-4 sm:p-6"
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
          v-if="modelCatalog?.state !== 'ready'"
          variant="warning"
          title="主机模型能力未获取"
          description="模型与推理强度暂不可确认。"
        />
        <AppAlert
          v-if="modelSelectionError"
          variant="warning"
          title="模型设置不可用"
          :description="modelSelectionError"
        />
        <AppAlert
          v-if="adjustedFields.length"
          variant="warning"
          title="设置已按当前权限调整"
          :description="adjustedFieldLabel"
        />

        <div class="codex-settings-fields grid gap-4">
          <BaseSelect
            v-if="modelOptions.length"
            :model-value="draft.requested.model || ''"
            label="模型"
            :options="modelOptions"
            @update:model-value="draft.requested.model = $event || null"
          />
          <BaseSelect
            v-if="reasoningOptions.length"
            :model-value="draft.requested.reasoning_effort || ''"
            label="推理强度"
            :options="reasoningOptions"
            @update:model-value="
              draft.requested.reasoning_effort = $event || null
            "
          />
          <BaseSelect
            :model-value="draft.requested.permission_mode"
            label="访问模式"
            :options="permissionOptions"
            @update:model-value="
              draft.requested.permission_mode =
                $event as ProjectExecutionOverrides['permission_mode']
            "
          />
          <p class="m-0 text-sm text-ink-muted">{{ effectiveLabel }}</p>
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
          运行设置已由本机确认，将在下一轮使用。
        </p>

        <div class="flex justify-end border-t border-line pt-4">
          <BaseButton
            :loading="saving"
            :disabled="Boolean(modelSelectionError)"
            @click="savePreferences"
          >
            保存运行设置
          </BaseButton>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { AuthScope } from '~/types/auth'
import { RuntimeFeatureFlag } from '~/types/app'
import { LOGIN_ROUTE } from '~/types/routes'
import type {
  ProjectExecutionOverrides,
  CodexWorkspaceExecutionPreferences,
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
const draftContext = ref<{ hostId: string; workspaceId: string } | null>(null)
const baseline = ref('')
const effectiveLabel = ref('')
const confirmedPreferences = ref<CodexWorkspaceExecutionPreferences | null>(
  null,
)
const dirty = computed(
  () => !!draft.value && JSON.stringify(draft.value) !== baseline.value,
)
let loadGeneration = 0
const draftHost = computed(() =>
  draftContext.value
    ? sessionStore.projection.hostsById[draftContext.value.hostId]
    : null,
)

const routeHostId = computed(() =>
  typeof route.query.hostId === 'string' ? route.query.hostId : undefined,
)
const routeWorkspaceId = computed(() =>
  typeof route.query.workspaceId === 'string'
    ? route.query.workspaceId
    : undefined,
)
const workspaceLabel = computed(() => {
  const workspace = draftContext.value
    ? sessionStore.projection.workspacesById[draftContext.value.workspaceId]
    : null
  const host = draftHost.value
  if (!workspace || !host) return '正在定位项目'
  return `${host.display_name} · ${workspace.display_name}`
})
const modelCatalog = computed(() => draftHost.value?.capabilities.model_catalog)
// A catalog default is not the inherited project model. An explicit override
// also cannot tell us what switching back to inheritance will resolve to.
const selectedModelId = computed(
  () =>
    draft.value?.requested.model ??
    (confirmedPreferences.value?.requested.model === null
      ? confirmedPreferences.value.model
      : null),
)
const selectedModelCapability = computed(() =>
  modelCatalog.value?.models.find(
    (item) => item.model === selectedModelId.value,
  ),
)
const confirmedInheritedEffort = computed(() => {
  const confirmed = confirmedPreferences.value
  return !draft.value?.requested.model &&
    confirmed?.requested.model === null &&
    !confirmed.error &&
    !['blocked', 'unverified'].includes(confirmed.applied_state) &&
    confirmed.requested.reasoning_effort === confirmed.reasoning_effort
    ? confirmed.requested.reasoning_effort
    : null
})
const modelOptions = computed(() => {
  const options = [
    { value: '', label: '继承本机项目配置' },
    ...(modelCatalog.value?.models ?? []).map((item) => ({
      value: item.model,
      label: item.display_name,
    })),
  ]
  if (
    draft.value?.requested.model &&
    !options.some((item) => item.value === draft.value?.requested.model)
  ) {
    options.push({
      value: draft.value.requested.model,
      label: `${draft.value.requested.model}（当前不可用）`,
    })
  }
  return options
})
const reasoningOptions = computed(() => {
  const options = [
    { value: '', label: '继承推理强度' },
    ...(selectedModelCapability.value?.reasoning_efforts ?? []).map(
      (value) => ({ value, label: value }),
    ),
  ]
  if (
    draft.value?.requested.reasoning_effort &&
    !options.some(
      (item) => item.value === draft.value?.requested.reasoning_effort,
    )
  ) {
    options.push({
      value: draft.value.requested.reasoning_effort,
      label: `${draft.value.requested.reasoning_effort}（${draft.value.requested.reasoning_effort === confirmedInheritedEffort.value ? '本机已确认' : '当前不可用'}）`,
    })
  }
  return options
})
const modelSelectionError = computed(() => {
  if (!draft.value?.requested.model && !draft.value?.requested.reasoning_effort)
    return ''
  if (modelCatalog.value?.state !== 'ready')
    return '等待主机模型能力同步后再保存。'
  const model = selectedModelCapability.value
  if (!model) {
    if (
      !draft.value?.requested.model &&
      draft.value?.requested.reasoning_effort === confirmedInheritedEffort.value
    )
      return ''
    return draft.value?.requested.model
      ? '所选模型当前不可用，请选择可用模型。'
      : '继承模型未公布可选档位，请继承推理强度。'
  }
  if (
    draft.value?.requested.reasoning_effort &&
    !model.reasoning_efforts.includes(draft.value.requested.reasoning_effort)
  ) {
    return '当前模型不支持所选推理强度。'
  }
  return ''
})
const permissionOptions = computed(() => [
  { value: 'inherit', label: '继承本机项目配置' },
  { value: 'restricted', label: '受限访问 · 命令需要审批' },
  ...(authStore.canScope(AuthScope.CodexFullAccess)
    ? [{ value: 'full_access', label: '完全访问 · 不请求普通命令审批' }]
    : []),
])
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
  const effective = result.effective_preferences
  confirmedPreferences.value = {
    ...effective,
    requested: { ...effective.requested },
  }
  draft.value = {
    expected_revision: effective.local_revision,
    requested: { ...effective.requested },
  }
  effectiveLabel.value =
    effective.error ||
    `本机确认：${effective.model ?? '默认模型'} · ${effective.reasoning_effort ?? '默认档位'} · ${effective.sandbox_mode} / ${effective.approval_policy}；设置在下一轮使用。`
  adjustedFields.value = result.adjusted_fields
  baseline.value = JSON.stringify(draft.value)
}

const loadPreferences = async (): Promise<void> => {
  const generation = ++loadGeneration
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
    const hostId = routeHostId.value ?? sessionStore.selectedHostId
    const workspaceId =
      routeWorkspaceId.value ?? sessionStore.selectedWorkspaceId
    if (!hostId || !workspaceId) throw new Error('缺少明确的项目身份。')
    draftContext.value = { hostId, workspaceId }
    const result = await createCodexWorkspacesClient().readExecutionPreferences(
      hostId,
      workspaceId,
    )
    if (generation !== loadGeneration) return
    applyResult(result)
  } catch (error) {
    if (generation !== loadGeneration) return
    pageError.value =
      error instanceof Error ? error.message : '读取运行设置失败。'
  } finally {
    if (generation === loadGeneration) loading.value = false
  }
}

const savePreferences = async (): Promise<void> => {
  if (!draft.value || !draftContext.value) return
  const generation = loadGeneration
  saving.value = true
  saveError.value = ''
  saveSuccess.value = false
  try {
    const result = await sessionStore.updateWorkspaceExecutionPreferences(
      draft.value,
      draftContext.value,
    )
    if (generation !== loadGeneration) return
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
const confirmLeave = () =>
  !dirty.value || window.confirm('运行设置尚未保存，是否放弃修改？')
onBeforeRouteLeave(() => confirmLeave())
onBeforeRouteUpdate(() => confirmLeave())
watch([routeHostId, routeWorkspaceId], () => void loadPreferences())
onBeforeUnmount(() => {
  loadGeneration += 1
})
</script>
