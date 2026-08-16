<template>
  <article
    class="grid min-w-0 gap-3 rounded-lg border border-line bg-surface p-4"
  >
    <header class="flex min-w-0 items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="m-0 text-sm font-semibold leading-5">
          {{ approval.display_summary.title || 'Codex 审批' }}
        </h3>
        <p class="mt-1 mb-0 text-xs leading-5 text-ink-muted">
          {{ approval.display_summary.reason || 'Codex 请求继续执行。' }}
        </p>
      </div>
      <BaseBadge :tone="riskTone" class="shrink-0">
        {{ riskLabel }}
      </BaseBadge>
    </header>

    <dl class="m-0 grid gap-2 text-xs">
      <div v-if="approval.display_summary.command" class="grid gap-1">
        <dt class="text-ink-muted">命令</dt>
        <dd
          class="m-0 overflow-x-auto rounded-md bg-surface-muted p-2 font-mono break-all"
        >
          {{ approval.display_summary.command }}
        </dd>
      </div>
      <div
        v-for="(action, index) in approval.display_summary.command_actions"
        :key="`${approval.approval_id}-action-${index}`"
        class="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3"
      >
        <dt class="text-ink-muted">{{ actionLabel(action.action_type) }}</dt>
        <dd class="m-0 min-w-0 break-all">
          <code>{{ action.command }}</code>
          <span v-if="action.path" class="mt-1 block text-ink-muted">
            路径：{{ action.path }}
          </span>
        </dd>
      </div>
      <div
        v-for="change in approval.display_summary.file_changes"
        :key="`${approval.approval_id}-${change.path}`"
        class="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3"
      >
        <dt class="text-ink-muted">文件变更</dt>
        <dd class="m-0 min-w-0 break-all">
          {{ change.path }} · {{ change.change_kind }}
          <BaseBadge v-if="change.sensitive" tone="warning" class="ml-1">
            敏感路径
          </BaseBadge>
        </dd>
      </div>
      <div
        v-if="approval.display_summary.permission_names.length"
        class="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3"
      >
        <dt class="text-ink-muted">额外权限</dt>
        <dd class="m-0 break-all">
          {{ approval.display_summary.permission_names.join('、') }}
        </dd>
      </div>
      <div
        v-if="approval.display_summary.network_requested"
        class="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3"
      >
        <dt class="text-ink-muted">网络权限</dt>
        <dd class="m-0">请求访问网络</dd>
      </div>
    </dl>

    <AppAlert
      v-if="decisionError"
      variant="danger"
      title="审批提交失败"
      :description="decisionError"
    />
    <footer class="flex flex-wrap items-center justify-end gap-2">
      <span v-if="decisionAcknowledged" class="mr-auto text-xs text-accent">
        已提交，等待 Agent 应用结果
      </span>
      <BaseButton
        size="sm"
        variant="secondary"
        :disabled="submitting"
        @click="submitDecision(CodexApprovalDecision.Decline)"
      >
        拒绝
      </BaseButton>
      <BaseButton
        size="sm"
        :disabled="submitting || !canAccept"
        :title="canAccept ? undefined : '当前账号缺少接受该请求所需的权限'"
        @click="requestAccept"
      >
        {{
          approval.risk_level === CodexApprovalRiskLevel.High
            ? '验证并允许'
            : '允许一次'
        }}
      </BaseButton>
    </footer>

    <BaseModal :open="stepUpOpen" title="增强验证" @close="closeStepUp">
      <form class="grid gap-4" @submit.prevent="submitStepUp">
        <BaseInput
          v-model="stepUpPassword"
          type="password"
          autocomplete="current-password"
          label="账号密码"
        />
        <AppAlert
          v-if="stepUpError"
          variant="danger"
          title="验证失败"
          :description="stepUpError"
        />
        <div class="flex justify-end gap-2">
          <BaseButton type="button" variant="secondary" @click="closeStepUp">
            取消
          </BaseButton>
          <BaseButton
            type="submit"
            :disabled="stepUpSubmitting || !stepUpPassword"
          >
            确认
          </BaseButton>
        </div>
      </form>
    </BaseModal>
  </article>
</template>

<script setup lang="ts">
import {
  CodexApprovalDecision,
  CodexApprovalDecisionState,
  CodexApprovalKind,
  CodexApprovalRiskLevel,
  type CodexApproval,
} from '~/types/codex-approval'
import { AuthScope, AuthStepUpPurpose } from '~/types/auth'

const APPROVAL_ACTION_LABELS: Readonly<Record<string, string>> = {
  read: '读取文件',
  listFiles: '扫描目录',
  search: '搜索内容',
  unknown: '执行命令',
}

const props = defineProps<{ approval: CodexApproval }>()
const approvalStore = useCodexApprovalsStore()
const authStore = useAuthStore()
const stepUpOpen = ref(false)
const stepUpPassword = ref('')
const stepUpError = ref('')
const stepUpSubmitting = ref(false)

const decisionState = computed(
  () =>
    approvalStore.decisionStateById[props.approval.approval_id] ??
    CodexApprovalDecisionState.Idle,
)
const submitting = computed(
  () => decisionState.value === CodexApprovalDecisionState.Submitting,
)
const decisionAcknowledged = computed(
  () => decisionState.value === CodexApprovalDecisionState.Acknowledged,
)
const decisionError = computed(
  () => approvalStore.decisionErrorById[props.approval.approval_id] ?? '',
)
const riskTone = computed(() =>
  props.approval.risk_level === CodexApprovalRiskLevel.High
    ? 'warning'
    : 'neutral',
)
const riskLabel = computed(() => {
  if (props.approval.risk_level === CodexApprovalRiskLevel.High)
    return '增强验证'
  return props.approval.display_summary.read_only ? '只读' : '单次'
})
const canAccept = computed(() => {
  const requiredScopes = new Set<AuthScope>()
  if (
    props.approval.approval_kind === CodexApprovalKind.FileChange ||
    props.approval.display_summary.file_scope.length > 0 ||
    props.approval.display_summary.file_changes.length > 0 ||
    props.approval.display_summary.extra_root_requested
  ) {
    requiredScopes.add(AuthScope.CodexFiles)
  }
  if (props.approval.approval_kind === CodexApprovalKind.Command) {
    requiredScopes.add(AuthScope.CodexTerminal)
  }
  if (props.approval.display_summary.network_requested) {
    requiredScopes.add(AuthScope.CodexNetwork)
  }
  if (props.approval.display_summary.extra_root_requested) {
    requiredScopes.add(AuthScope.CodexFullAccess)
  }
  return [...requiredScopes].every((scope) => authStore.canScope(scope))
})

const actionLabel = (actionType: string): string =>
  APPROVAL_ACTION_LABELS[actionType] ?? actionType

const submitDecision = (decision: CodexApprovalDecision): void => {
  void approvalStore.decide(props.approval, decision).catch(() => undefined)
}

const requestAccept = (): void => {
  if (!canAccept.value) return
  if (props.approval.risk_level === CodexApprovalRiskLevel.High) {
    stepUpOpen.value = true
    stepUpPassword.value = ''
    stepUpError.value = ''
    return
  }
  submitDecision(CodexApprovalDecision.Accept)
}

const closeStepUp = (): void => {
  stepUpOpen.value = false
  stepUpPassword.value = ''
  stepUpError.value = ''
}

const submitStepUp = async (): Promise<void> => {
  stepUpSubmitting.value = true
  stepUpError.value = ''
  try {
    const grant = await authStore.issueStepUpGrant(
      stepUpPassword.value,
      AuthStepUpPurpose.CodexHighRiskApproval,
    )
    await approvalStore.decide(
      props.approval,
      CodexApprovalDecision.Accept,
      grant,
    )
    closeStepUp()
  } catch (error) {
    stepUpError.value =
      error instanceof Error ? error.message : '增强验证失败。'
  } finally {
    stepUpSubmitting.value = false
  }
}

onBeforeUnmount(closeStepUp)
</script>
