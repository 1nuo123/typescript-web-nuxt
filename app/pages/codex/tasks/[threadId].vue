<template>
  <section
    class="mx-auto grid h-[calc(100dvh-8.5rem)] w-full min-w-0 max-w-4xl grid-cols-1 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden lg:h-full"
  >
    <header class="grid min-w-0 grid-cols-1 gap-3 border-b border-line pb-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <NuxtLink
            :to="CODEX_TASKS_ROUTE"
            class="inline-flex items-center gap-1 text-xs text-ink-muted no-underline hover:text-ink"
          >
            <ChevronLeft class="size-3.5" aria-hidden="true" />
            所有任务
          </NuxtLink>
          <h1 class="mt-1.5 mb-0 line-clamp-2 text-lg font-semibold leading-6">
            {{ thread?.display_name || 'Codex 任务' }}
          </h1>
          <div
            class="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-muted"
          >
            <span>{{
              sessionStore.selectedWorkspace?.display_name || '未选择项目'
            }}</span>
            <span aria-hidden="true">/</span>
            <span>{{ thread?.model || '默认模型' }}</span>
            <span
              class="inline-flex items-center gap-1 rounded-md bg-surface-muted px-1.5 py-0.5"
            >
              <span
                class="size-1.5 rounded-full"
                :class="activeTurn ? 'bg-accent' : 'bg-ink-muted'"
              />
              {{ statusLabel }}
            </span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <BaseButton
            v-if="canCompact"
            size="sm"
            variant="secondary"
            :disabled="activeTurn || compacting"
            title="压缩线程上下文"
            @click="compact"
          >
            <ArchiveRestore class="size-3.5" aria-hidden="true" />
            {{ compacting ? '压缩中…' : '压缩' }}
          </BaseButton>
          <CodexTurnActions
            :active="activeTurn && canOperate"
            :interrupting="interrupting"
            @interrupt="interrupt"
          />
        </div>
      </div>
      <div v-if="canOperate" class="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <BaseSelect
          v-if="modelOptions.length"
          :model-value="sessionStore.executionOptions.model || ''"
          label="模型"
          :options="modelOptions"
          @update:model-value="
            sessionStore.executionOptions.model = $event || null
          "
        />
        <BaseSelect
          v-if="reasoningOptions.length"
          :model-value="sessionStore.executionOptions.reasoning_effort || ''"
          label="推理强度"
          :options="reasoningOptions"
          @update:model-value="
            sessionStore.executionOptions.reasoning_effort = $event || null
          "
        />
        <BaseSelect
          :model-value="sessionStore.executionOptions.sandbox_mode"
          label="沙箱"
          :options="sandboxOptions"
          @update:model-value="
            sessionStore.executionOptions.sandbox_mode =
              $event as CodexSandboxMode
          "
        />
        <BaseSelect
          :model-value="sessionStore.executionOptions.approval_policy"
          label="审批策略"
          :options="approvalPolicyOptions"
          @update:model-value="
            sessionStore.executionOptions.approval_policy =
              $event as CodexApprovalPolicy
          "
        />
      </div>
      <p
        v-if="sessionStore.pendingOperation"
        class="m-0 text-xs text-ink-muted"
        aria-live="polite"
      >
        操作 {{ sessionStore.pendingOperation.status }} ·
        {{ sessionStore.pendingOperation.operation_id }}
      </p>
      <AppAlert
        v-if="pageError"
        variant="danger"
        title="操作失败"
        :description="pageError"
      />
      <AppAlert
        v-else-if="hostUnavailable"
        variant="warning"
        title="主机离线"
        description="当前仅显示已持久化的任务索引。启动本机 Codex Agent 后可继续发送消息。"
      />
      <AppAlert
        v-if="historyOmitted"
        variant="warning"
        title="较早的历史记录未加载"
        description="该会话历史超过远程读取上限。当前连接和新消息仍可正常使用，完整记录请在本机 Codex 中查看。"
      />
      <AppAlert
        v-else-if="historyNotRequested"
        variant="info"
        title="仅加载实时消息"
        description="较早的本地历史记录未在远程页面加载，当前连接和新消息仍可正常使用。"
      />
    </header>

    <div class="min-h-0 min-w-0 max-w-full overflow-x-hidden py-3">
      <div
        v-if="sessionStore.selectedHistoryCursor"
        class="mb-2 flex justify-center"
      >
        <BaseButton size="sm" variant="secondary" @click="loadMoreHistory"
          >加载更早记录</BaseButton
        >
      </div>
      <CodexTimeline :items="sessionStore.selectedTimeline" />
    </div>

    <div class="min-w-0 max-w-full overflow-x-hidden bg-canvas pt-2 pb-1">
      <CodexComposer
        v-model="draft"
        :active-turn="activeTurn"
        :submitting="submitting"
        :disabled="hostUnavailable || !canOperate"
        @submit="send"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ArchiveRestore, ChevronLeft } from '@lucide/vue'
import { AuthScope } from '~/types/auth'
import { RuntimeFeatureFlag } from '~/types/app'
import {
  CodexCapabilityCode,
  CodexHostStatus,
  type CodexApprovalPolicy,
  type CodexSandboxMode,
} from '~/types/codex-host'
import { CodexThreadHistoryStatus } from '~/types/codex-thread'
import { LOGIN_ROUTE, CODEX_TASKS_ROUTE } from '~/types/routes'

definePageMeta({
  layout: 'codex',
  requiresAuth: true,
  redirectTo: LOGIN_ROUTE,
  requiredScopes: [AuthScope.CodexRead],
  requiredRuntimeFlag: RuntimeFeatureFlag.Codex,
  title: 'Codex 任务详情',
})

const route = useRoute()
const authStore = useAuthStore()
const sessionStore = useCodexSessionStore()
const uiStore = useCodexUiStore()
const threadId = computed(() => String(route.params.threadId || ''))
const thread = computed(() => sessionStore.selectedThread)
const activeTurn = computed(() => Boolean(thread.value?.active_turn_id))
const canOperate = computed(() => authStore.canScope(AuthScope.CodexOperate))
const canCompact = computed(
  () =>
    canOperate.value &&
    Boolean(
      sessionStore.selectedHost?.capabilities.items.some(
        (item) => item.code === CodexCapabilityCode.ThreadCompact,
      ),
    ),
)
const hostUnavailable = computed(
  () => sessionStore.selectedHost?.status !== CodexHostStatus.Online,
)
const historyOmitted = computed(
  () =>
    sessionStore.selectedHistoryStatus ===
    CodexThreadHistoryStatus.OmittedTooLarge,
)
const historyNotRequested = computed(
  () =>
    sessionStore.selectedHistoryStatus ===
    CodexThreadHistoryStatus.NotRequested,
)
const statusLabel = computed(() => {
  if (activeTurn.value) return '运行中'
  const labels: Record<string, string> = {
    idle: '空闲',
    notLoaded: '可继续',
    loaded: '已加载',
    interrupted: '已中断',
    unknown: '待恢复',
    archived: '已归档',
  }
  return labels[thread.value?.status || ''] ?? thread.value?.status ?? '同步中'
})
const submitting = ref(false)
const interrupting = ref(false)
const compacting = ref(false)
const pageError = ref('')
const draft = computed({
  get: () => uiStore.draftsByThreadId[threadId.value] ?? '',
  set: (value: string) => uiStore.setDraft(threadId.value, value),
})
const modelOptions = computed(() =>
  (sessionStore.selectedHost?.capabilities.model_ids ?? []).map((value) => ({
    value,
    label: value,
  })),
)
const reasoningOptions = computed(() =>
  (sessionStore.selectedHost?.capabilities.reasoning_efforts ?? []).map(
    (value) => ({ value, label: value }),
  ),
)
const sandboxOptions = computed(() =>
  (sessionStore.selectedHost?.capabilities.sandbox_modes ?? []).map(
    (value) => ({
      value,
      label: value,
    }),
  ),
)
const approvalPolicyOptions = computed(() =>
  (sessionStore.selectedHost?.capabilities.approval_policies ?? []).map(
    (value) => ({ value, label: value }),
  ),
)

const send = async (message: string): Promise<void> => {
  submitting.value = true
  pageError.value = ''
  try {
    await sessionStore.sendMessage(message)
    uiStore.clearDraft(threadId.value)
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : '消息发送失败。'
  } finally {
    submitting.value = false
  }
}
const interrupt = async (): Promise<void> => {
  interrupting.value = true
  pageError.value = ''
  try {
    await sessionStore.interruptTurn()
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : '任务中断失败。'
  } finally {
    interrupting.value = false
  }
}
const compact = async (): Promise<void> => {
  compacting.value = true
  pageError.value = ''
  try {
    await sessionStore.compactThread()
    await sessionStore.loadThreadSnapshot()
  } catch (error) {
    pageError.value = error instanceof Error ? error.message : '线程压缩失败。'
  } finally {
    compacting.value = false
  }
}
const loadMoreHistory = async (): Promise<void> => {
  try {
    await sessionStore.loadMoreHistory()
  } catch (error) {
    pageError.value =
      error instanceof Error ? error.message : '历史记录加载失败。'
  }
}

onMounted(async () => {
  sessionStore.selectThread(threadId.value)
  await sessionStore.refreshAuthority()
})
</script>
