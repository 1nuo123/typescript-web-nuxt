<template>
  <section class="h-full min-h-0 overflow-y-auto p-4 sm:p-6">
    <CodexMobilePageHeader title="审批中心" />
    <div class="mx-auto grid w-full max-w-3xl gap-5">
      <header
        class="flex items-center justify-between gap-3 border-b border-line pb-4"
      >
        <div>
          <h1 class="m-0 text-lg font-semibold">审批</h1>
          <p class="mt-1 mb-0 text-xs text-ink-muted">
            {{ visiblePendingApprovals.length }} 项待处理
          </p>
        </div>
        <NuxtLink
          v-if="returnRoute"
          :to="returnRoute"
          class="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-line px-3 text-xs font-medium hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <ArrowLeft class="size-3.5" aria-hidden="true" />
          返回会话
        </NuxtLink>
      </header>

      <AppSkeleton v-if="approvalStore.loading" class="h-40" />
      <EmptyState
        v-else-if="visiblePendingApprovals.length === 0"
        eyebrow="当前安全"
        title="没有待处理审批"
        description="新的命令、文件变更或权限请求会实时出现在这里。"
      />
      <div v-else class="grid gap-5">
        <section
          v-for="group in approvalGroups"
          :key="group.key"
          class="grid gap-3"
        >
          <header class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="m-0 text-sm font-semibold">{{ group.label }}</h2>
            <BaseButton
              v-if="group.canApproveReadOnly"
              size="sm"
              variant="secondary"
              :disabled="group.submitting"
              @click="approveReadOnlyGroup(group.items)"
            >
              <CheckCheck class="size-3.5" aria-hidden="true" />
              {{ group.submitting ? '提交中…' : '允许本组只读命令' }}
            </BaseButton>
          </header>
          <CodexApprovalCard
            v-for="approval in group.items"
            :key="approval.approval_id"
            :approval="approval"
          />
        </section>
      </div>

      <section
        v-if="visibleRecentlyResolved.length"
        class="grid gap-2 border-t border-line pt-4"
      >
        <h2 class="m-0 text-sm font-semibold">最近处理</h2>
        <CodexApprovalCard
          v-for="approval in visibleRecentlyResolved"
          :key="`resolved-${approval.approval_id}`"
          :approval="approval"
        />
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ArrowLeft, CheckCheck } from '@lucide/vue'
import {
  CodexApprovalDecision,
  CodexApprovalDecisionState,
  CodexApprovalKind,
  CodexApprovalRiskLevel,
  CodexApprovalState,
  type CodexApproval,
} from '~/types/codex-approval'
import { AuthScope } from '~/types/auth'
import { RuntimeFeatureFlag } from '~/types/app'
import { CODEX_TASKS_ROUTE, LOGIN_ROUTE } from '~/types/routes'

interface ApprovalGroup {
  key: string
  label: string
  items: CodexApproval[]
  canApproveReadOnly: boolean
  submitting: boolean
}

interface ApprovalPresentation {
  label: string
}

const approvalDecisionPresentation = {
  [CodexApprovalDecision.Accept]: { label: '已允许' },
  [CodexApprovalDecision.AcceptForSession]: { label: '本会话已允许' },
  [CodexApprovalDecision.AcceptWithExecpolicyAmendment]: {
    label: '已应用命令策略',
  },
  [CodexApprovalDecision.ApplyNetworkPolicyAmendment]: {
    label: '已应用网络策略',
  },
  [CodexApprovalDecision.Decline]: { label: '已拒绝' },
  [CodexApprovalDecision.Cancel]: { label: '已取消' },
} satisfies Record<CodexApprovalDecision, ApprovalPresentation>

const approvalStatePresentation = {
  [CodexApprovalState.Pending]: { label: '等待处理' },
  [CodexApprovalState.Claimed]: { label: '正在交付' },
  [CodexApprovalState.Applied]: { label: '已交付' },
  [CodexApprovalState.DeliveryFailed]: { label: '交付失败' },
  [CodexApprovalState.Expired]: { label: '已过期' },
  [CodexApprovalState.Cancelled]: { label: '已取消交付' },
} satisfies Record<CodexApprovalState, ApprovalPresentation>

definePageMeta({
  path: '/codex/approval-center',
  layout: 'codex',
  requiresAuth: true,
  redirectTo: LOGIN_ROUTE,
  requiredScopes: [AuthScope.CodexApprove],
  requiredRuntimeFlag: RuntimeFeatureFlag.Codex,
  title: 'Codex 审批',
})

const approvalStore = useCodexApprovalsStore()
const authStore = useAuthStore()
const route = useRoute()
const selectedThreadId = computed(() =>
  typeof route.query.threadId === 'string' ? route.query.threadId : null,
)
const returnRoute = computed(() => {
  const candidate = route.query.returnTo
  return typeof candidate === 'string' &&
    candidate.startsWith(`${CODEX_TASKS_ROUTE}/`)
    ? candidate
    : null
})
const visiblePendingApprovals = computed(() =>
  selectedThreadId.value
    ? approvalStore.pending.filter(
        (approval) => approval.thread_id === selectedThreadId.value,
      )
    : approvalStore.pending,
)
const visibleRecentlyResolved = computed(() =>
  selectedThreadId.value
    ? approvalStore.recentlyResolved.filter(
        (approval) => approval.thread_id === selectedThreadId.value,
      )
    : approvalStore.recentlyResolved,
)
const returnedToConversation = ref(false)

const isSubmitting = (approval: CodexApproval): boolean =>
  approvalStore.decisionStateById[approval.approval_id] ===
  CodexApprovalDecisionState.Submitting

const resolvedDecisionLabel = (approval: CodexApproval): string =>
  approval.decision
    ? approvalDecisionPresentation[approval.decision].label
    : approval.state === CodexApprovalState.Expired
      ? '未处理'
      : approvalStatePresentation[approval.state].label

const approvalGroups = computed<ApprovalGroup[]>(() => {
  const groups = new Map<string, CodexApproval[]>()
  for (const approval of visiblePendingApprovals.value) {
    const key = approval.turn_id || approval.approval_id
    groups.set(key, [...(groups.get(key) ?? []), approval])
  }
  return [...groups.entries()].map(([key, items]) => ({
    key,
    label: items[0]?.turn_id ? '本轮审批' : '独立审批',
    items,
    canApproveReadOnly:
      items.length > 1 &&
      authStore.canScope(AuthScope.CodexTerminal) &&
      items.every(
        (approval) =>
          approval.approval_kind === CodexApprovalKind.Command &&
          approval.risk_level === CodexApprovalRiskLevel.Normal &&
          approval.display_summary.read_only &&
          approval.display_summary.allowed_actions.includes(
            CodexApprovalDecision.Accept,
          ),
      ),
    submitting: items.some(isSubmitting),
  }))
})

const approveReadOnlyGroup = async (items: CodexApproval[]): Promise<void> => {
  for (const approval of items) {
    if (
      approvalStore.approvalsById[approval.approval_id]?.state !==
      CodexApprovalState.Pending
    ) {
      continue
    }
    try {
      await approvalStore.decide(approval, CodexApprovalDecision.Accept)
    } catch {
      return
    }
  }
}

watch(
  () => approvalStore.lastResolvedApproval,
  (approval) => {
    if (
      returnedToConversation.value ||
      !approval ||
      (approval.state !== CodexApprovalState.Applied &&
        approval.state !== CodexApprovalState.Cancelled) ||
      !returnRoute.value ||
      (selectedThreadId.value &&
        approval.thread_id !== selectedThreadId.value) ||
      approvalStore.pendingForThread(approval.thread_id).length > 0
    ) {
      return
    }
    returnedToConversation.value = true
    void navigateTo(returnRoute.value)
  },
)

onMounted(() => approvalStore.load())
</script>
