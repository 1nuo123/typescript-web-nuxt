<template>
  <section class="mx-auto grid w-full min-w-0 max-w-3xl grid-cols-1 gap-6">
    <header
      class="flex items-center justify-between gap-3 border-b border-line pb-5"
    >
      <h1 class="m-0 text-xl font-semibold">审批</h1>
      <span class="text-xs text-ink-muted"
        >{{ approvalStore.pending.length }} 项待处理</span
      >
    </header>

    <AppSkeleton v-if="approvalStore.loading" class="h-40" />
    <EmptyState
      v-else-if="approvalStore.pending.length === 0"
      eyebrow="当前安全"
      title="没有待处理审批"
      description="新的命令或文件变更请求会实时出现在这里。"
    />
    <div v-else class="grid gap-3">
      <article
        v-for="approval in approvalStore.pending"
        :key="approval.approval_id"
        class="grid gap-4 rounded-lg border border-line bg-surface p-4 shadow-card"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="m-0 text-base font-semibold">
              {{ approval.display_summary.title || 'Codex 审批' }}
            </h2>
            <p class="mt-1 mb-0 text-sm text-ink-muted">
              {{ approval.display_summary.reason || 'Codex 请求继续执行。' }}
            </p>
          </div>
          <BaseBadge
            :tone="
              approval.risk_level === CodexApprovalRiskLevel.High
                ? 'warning'
                : 'neutral'
            "
          >
            {{
              approval.risk_level === CodexApprovalRiskLevel.High
                ? '增强验证'
                : '单次'
            }}
          </BaseBadge>
        </div>
        <dl class="m-0 grid gap-2 rounded-md bg-surface-muted p-3 text-xs">
          <div
            v-if="approval.display_summary.command_summary"
            class="flex gap-3"
          >
            <dt class="w-20 shrink-0 text-ink-muted">命令摘要</dt>
            <dd class="m-0 break-all">
              {{ approval.display_summary.command_summary }}
            </dd>
          </div>
          <div
            v-if="approval.display_summary.workspace_name"
            class="flex gap-3"
          >
            <dt class="w-20 shrink-0 text-ink-muted">工作区</dt>
            <dd class="m-0 break-all">
              {{ approval.display_summary.workspace_name }}
            </dd>
          </div>
          <div
            v-if="approval.display_summary.file_scope.length"
            class="flex gap-3"
          >
            <dt class="w-20 shrink-0 text-ink-muted">文件范围</dt>
            <dd class="m-0 break-all">
              {{ approval.display_summary.file_scope.join('、') }}
            </dd>
          </div>
          <div
            v-if="approval.display_summary.permission_names.length"
            class="flex gap-3"
          >
            <dt class="w-20 shrink-0 text-ink-muted">额外权限</dt>
            <dd class="m-0">
              {{ approval.display_summary.permission_names.join('、') }}
            </dd>
          </div>
          <div
            v-if="approval.display_summary.network_requested"
            class="flex gap-3"
          >
            <dt class="w-20 shrink-0 text-ink-muted">网络权限</dt>
            <dd class="m-0">请求访问网络</dd>
          </div>
        </dl>
        <div class="flex justify-end gap-2">
          <BaseButton
            variant="secondary"
            :disabled="approvalStore.decidingId === approval.approval_id"
            @click="decide(approval, CodexApprovalDecision.Decline)"
          >
            拒绝
          </BaseButton>
          <BaseButton
            :disabled="
              approval.risk_level === CodexApprovalRiskLevel.High ||
              approvalStore.decidingId === approval.approval_id
            "
            @click="requestAccept(approval)"
          >
            允许一次
          </BaseButton>
        </div>
      </article>
    </div>

    <BaseModal v-if="stepUpApproval" title="增强验证" @close="closeStepUp">
      <form class="grid gap-4" @submit.prevent="submitStepUp">
        <p class="m-0 text-sm text-ink-muted">
          请输入当前账号密码确认这次高风险操作。密码只在本次请求中使用。
        </p>
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
  </section>
</template>

<script setup lang="ts">
import {
  CodexApprovalDecision,
  CodexApprovalRiskLevel,
  type CodexApproval,
} from '~/types/codex-approval'
import { AuthScope, AuthStepUpPurpose } from '~/types/auth'
import { RuntimeFeatureFlag } from '~/types/app'
import { LOGIN_ROUTE } from '~/types/routes'

definePageMeta({
  layout: 'codex',
  requiresAuth: true,
  redirectTo: LOGIN_ROUTE,
  requiredScopes: [AuthScope.CodexApprove],
  requiredRuntimeFlag: RuntimeFeatureFlag.Codex,
  title: 'Codex 审批',
})

const approvalStore = useCodexApprovalsStore()
const authStore = useAuthStore()
const stepUpApproval = ref<CodexApproval | null>(null)
const stepUpPassword = ref('')
const stepUpError = ref('')
const stepUpSubmitting = ref(false)
const decide = async (
  approval: CodexApproval,
  decision: CodexApprovalDecision,
  stepUpToken?: string,
): Promise<void> => {
  await approvalStore.decide(approval, decision, stepUpToken)
}

const requestAccept = (approval: CodexApproval): void => {
  if (approval.risk_level === CodexApprovalRiskLevel.High) {
    stepUpApproval.value = approval
    stepUpPassword.value = ''
    stepUpError.value = ''
    return
  }
  void decide(approval, CodexApprovalDecision.Accept)
}

const closeStepUp = (): void => {
  stepUpApproval.value = null
  stepUpPassword.value = ''
  stepUpError.value = ''
}

const submitStepUp = async (): Promise<void> => {
  if (!stepUpApproval.value) return
  stepUpSubmitting.value = true
  stepUpError.value = ''
  try {
    const grant = await authStore.issueStepUpGrant(
      stepUpPassword.value,
      AuthStepUpPurpose.CodexHighRiskApproval,
    )
    await decide(stepUpApproval.value, CodexApprovalDecision.Accept, grant)
    closeStepUp()
  } catch (error) {
    stepUpError.value =
      error instanceof Error ? error.message : '增强验证失败。'
  } finally {
    stepUpSubmitting.value = false
  }
}

onMounted(() => approvalStore.load())
</script>
