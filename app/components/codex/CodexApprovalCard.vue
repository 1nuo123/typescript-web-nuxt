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
      <div v-if="commandSummary?.command" class="grid gap-1">
        <dt class="text-ink-muted">命令</dt>
        <dd
          class="m-0 overflow-x-auto rounded-md bg-surface-muted p-2 font-mono break-all"
        >
          {{ commandSummary.command }}
        </dd>
      </div>
      <div
        v-for="(action, index) in commandSummary?.command_actions ?? []"
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
        v-for="change in fileChangeSummary?.file_changes ?? []"
        :key="`${approval.approval_id}-${change.path}`"
        class="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3"
      >
        <dt class="text-ink-muted">文件变更</dt>
        <dd class="m-0 min-w-0 break-all">
          {{ change.path }} · {{ fileChangeLabel(change.change_kind) }}
          <BaseBadge v-if="change.sensitive" tone="warning" class="ml-1">
            敏感路径
          </BaseBadge>
          <pre
            v-if="change.diff !== null && change.diff !== undefined"
            class="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all border-l-2 border-line pl-2 text-xs leading-5"
            >{{ change.diff }}</pre
          >
          <span v-if="change.truncated" class="mt-1 block text-ink-muted"
            >内容已截断</span
          >
        </dd>
      </div>
      <div
        v-if="permissionsSummary?.permission_names.length"
        class="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3"
      >
        <dt class="text-ink-muted">额外权限</dt>
        <dd class="m-0 break-all">
          {{ permissionsSummary.permission_names.join('、') }}
        </dd>
      </div>
      <div
        v-if="permissionsSummary?.network_requested"
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
      <span
        v-if="approvalStateMessage"
        class="mr-auto text-xs"
        :class="approvalStateTone"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {{ approvalStateMessage }}
      </span>
      <BaseButton
        v-if="approval.state === CodexApprovalState.DeliveryFailed && approval.decision"
        size="sm" variant="secondary" :disabled="submitting"
        @click="requestGrant(approval.decision)"
      >重新核对并交付</BaseButton>
      <BaseButton
        v-if="canDecide && allows(CodexApprovalDecision.Decline)"
        size="sm"
        variant="secondary"
        :disabled="submitting"
        @click="submitDecision(CodexApprovalDecision.Decline)"
      >
        拒绝
      </BaseButton>
      <BaseButton
        v-if="canDecide && allows(CodexApprovalDecision.Cancel)"
        size="sm"
        variant="secondary"
        :disabled="submitting"
        @click="submitDecision(CodexApprovalDecision.Cancel)"
      >
        终止
      </BaseButton>
      <BaseButton
        v-if="canDecide && allows(CodexApprovalDecision.Accept)"
        size="sm"
        :disabled="submitting || !canGrant"
        :title="canGrant ? undefined : '当前账号缺少接受该请求所需的权限'"
        @click="requestGrant(CodexApprovalDecision.Accept)"
      >
        {{
          approval.risk_level === CodexApprovalRiskLevel.High
            ? '验证并允许'
            : '允许一次'
        }}
      </BaseButton>
      <BaseButton
        v-if="canDecide && allows(CodexApprovalDecision.AcceptForSession)"
        size="sm"
        variant="secondary"
        :disabled="submitting || !canGrant"
        :title="canGrant ? undefined : '当前账号缺少接受该请求所需的权限'"
        @click="requestGrant(CodexApprovalDecision.AcceptForSession)"
      >
        本会话允许
      </BaseButton>
      <BaseButton
        v-if="
          canDecide &&
          allows(CodexApprovalDecision.AcceptWithExecpolicyAmendment)
        "
        size="sm"
        variant="secondary"
        :disabled="submitting || !canGrant"
        :title="canGrant ? undefined : '当前账号缺少接受该请求所需的权限'"
        @click="
          requestGrant(CodexApprovalDecision.AcceptWithExecpolicyAmendment)
        "
      >
        应用命令策略
      </BaseButton>
      <BaseButton
        v-if="
          canDecide && allows(CodexApprovalDecision.ApplyNetworkPolicyAmendment)
        "
        size="sm"
        variant="secondary"
        :disabled="submitting || !canGrant"
        :title="canGrant ? undefined : '当前账号缺少接受该请求所需的权限'"
        @click="requestGrant(CodexApprovalDecision.ApplyNetworkPolicyAmendment)"
      >
        应用网络策略
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
  CodexApprovalState,
  type CodexApproval,
} from '~/types/codex-approval'
import { AuthScope, AuthStepUpPurpose } from '~/types/auth'

const APPROVAL_ACTION_LABELS: Readonly<Record<string, string>> = {
  read: '读取文件',
  listFiles: '扫描目录',
  search: '搜索内容',
  unknown: '执行命令',
}

const FILE_CHANGE_LABELS: Readonly<Record<string, string>> = {
  added: '新建',
  modified: '修改',
  deleted: '删除',
  renamed: '重命名',
}

const props = defineProps<{ approval: CodexApproval }>()
const fileChangeLabel = (kind: string): string =>
  FILE_CHANGE_LABELS[kind] ?? kind
const approvalStore = useCodexApprovalsStore()
const authStore = useAuthStore()
const stepUpOpen = ref(false)
const stepUpPassword = ref('')
const stepUpError = ref('')
const stepUpSubmitting = ref(false)
const stepUpDecision = ref(CodexApprovalDecision.Accept)

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
const canDecide = computed(
  () => props.approval.state === CodexApprovalState.Pending,
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
  return commandSummary.value?.read_only ? '只读' : '单次'
})
const commandSummary = computed(() =>
  props.approval.approval_kind === CodexApprovalKind.Command
    ? props.approval.display_summary
    : null,
)
const fileChangeSummary = computed(() =>
  props.approval.approval_kind === CodexApprovalKind.FileChange
    ? props.approval.display_summary
    : null,
)
const permissionsSummary = computed(() =>
  props.approval.approval_kind === CodexApprovalKind.Permissions
    ? props.approval.display_summary
    : null,
)
const canGrant = computed(() => {
  const requiredScopes = new Set<AuthScope>()
  switch (props.approval.approval_kind) {
    case CodexApprovalKind.Command:
      requiredScopes.add(AuthScope.CodexTerminal)
      break
    case CodexApprovalKind.FileChange:
      requiredScopes.add(AuthScope.CodexFiles)
      break
    case CodexApprovalKind.Permissions:
      if (props.approval.display_summary.network_requested) {
        requiredScopes.add(AuthScope.CodexNetwork)
      }
      if (props.approval.display_summary.extra_root_requested) {
        requiredScopes.add(AuthScope.CodexFullAccess)
      }
      break
  }
  return [...requiredScopes].every((scope) => authStore.canScope(scope))
})

const actionLabel = (actionType: string): string =>
  APPROVAL_ACTION_LABELS[actionType] ?? actionType

const allows = (decision: CodexApprovalDecision): boolean =>
  props.approval.display_summary.allowed_actions.includes(decision)

const approvalStateMessage = computed(() => {
  switch (props.approval.state) {
    case CodexApprovalState.Claimed:
      return '审批结果已提交，正在等待 Agent 确认应用。'
    case CodexApprovalState.DeliveryFailed:
      return '决策已记录但未确认交付。可重新核对；原请求失效时请返回会话触发新审批。'
    case CodexApprovalState.Applied:
      return 'Agent 已确认审批结果；文件是否成功以工具结果为准。'
    case CodexApprovalState.Expired:
      return '审批已过期。'
    case CodexApprovalState.Cancelled:
      return '审批已取消交付。'
    case CodexApprovalState.Pending:
      return decisionAcknowledged.value ? '审批结果正在提交。' : ''
  }
})

const approvalStateTone = computed(() =>
  props.approval.state === CodexApprovalState.DeliveryFailed
    ? 'text-danger'
    : props.approval.state === CodexApprovalState.Claimed
      ? 'text-warning'
      : 'text-accent',
)

const submitDecision = (decision: CodexApprovalDecision): void => {
  void approvalStore.decide(props.approval, decision).catch(() => undefined)
}

const requestGrant = (decision: CodexApprovalDecision): void => {
  if (!canGrant.value) return
  if (props.approval.risk_level === CodexApprovalRiskLevel.High) {
    stepUpDecision.value = decision
    stepUpOpen.value = true
    stepUpPassword.value = ''
    stepUpError.value = ''
    return
  }
  submitDecision(decision)
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
    await approvalStore.decide(props.approval, stepUpDecision.value, grant)
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
