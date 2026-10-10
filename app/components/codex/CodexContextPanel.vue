<template>
  <aside
    class="fixed inset-0 z-50 grid min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] bg-surface xl:static xl:z-auto xl:border-l xl:border-line"
    aria-label="会话上下文"
  >
    <header class="flex h-14 items-center gap-2 border-b border-line px-3">
      <strong class="min-w-0 flex-1 truncate text-sm">上下文</strong>
      <button
        type="button"
        class="grid size-8 place-items-center rounded-md text-ink-muted hover:bg-surface-muted hover:text-ink"
        title="关闭上下文"
        aria-label="关闭上下文"
        @click="closeContextRoute"
      >
        <X class="size-4" aria-hidden="true" />
      </button>
    </header>
    <div
      class="grid grid-cols-3 border-b border-line p-1"
      role="tablist"
      aria-label="上下文类型"
    >
      <button
        v-for="tab in tabs"
        :key="tab.view"
        type="button"
        role="tab"
        :aria-selected="uiStore.contextView === tab.view"
        class="flex h-8 items-center justify-center gap-1.5 rounded text-xs"
        :class="
          uiStore.contextView === tab.view
            ? 'bg-surface-muted font-semibold'
            : 'text-ink-muted'
        "
        @click="selectContextRoute(tab.view)"
      >
        <component :is="tab.icon" class="size-3.5" aria-hidden="true" />
        {{ tab.label }}
        <span v-if="tab.count" class="text-[0.625rem] text-ink-muted">{{
          tab.count
        }}</span>
      </button>
    </div>

    <div class="min-h-0 overflow-y-auto p-3">
      <template v-if="uiStore.contextView === CodexContextView.Changes">
        <p
          v-if="diffItems.length === 0"
          class="m-0 py-10 text-center text-xs text-ink-muted"
        >
          尚未收到可展示的文件变更。通过命令写入的文件可能没有结构化变更记录；此处不代表磁盘没有变化。
        </p>
        <div v-else class="grid gap-3">
          <select
            :value="selectedDiff?.header.item_id || ''"
            class="h-9 w-full min-w-0 rounded-md border border-line bg-surface px-2 text-xs"
            aria-label="选择文件变更"
            @change="selectDiff"
          >
            <option
              v-for="(item, index) in diffItems"
              :key="item.header.item_id"
              :value="item.header.item_id"
            >
              第 {{ index + 1 }} 次变更 · {{ item.detail.diff.files.length }} 个文件
            </option>
          </select>
          <section
            v-if="selectedDiffFile"
            class="grid min-w-0 gap-3"
            aria-label="单文件变更页面"
          >
            <header class="flex min-w-0 items-center gap-2">
              <BaseButton
                size="sm"
                variant="secondary"
                class="shrink-0"
                @click="returnToDiffFileList"
              >
                <ArrowLeft class="size-3.5" aria-hidden="true" />
                返回文件列表
              </BaseButton>
              <strong class="min-w-0 flex-1 truncate text-sm">
                {{ selectedDiffFile.path }}
              </strong>
            </header>
            <CodexDiffView
              :file="selectedDiffFile"
              :truncated="selectedDiff?.detail.diff.truncated"
            />
          </section>
          <ul
            v-else-if="selectedDiff?.detail.diff.files.length"
            class="grid list-none gap-2 p-0"
            aria-label="变更文件列表"
          >
            <li v-for="file in selectedDiff.detail.diff.files" :key="file.path">
              <button
                type="button"
                class="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-left text-xs hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-primary"
                @click="openDiffFile(file.path)"
              >
                <FileCode2
                  class="size-4 shrink-0 text-ink-muted"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-medium text-ink">{{
                    file.path
                  }}</span>
                  <span
                    v-if="file.old_path"
                    class="block truncate text-ink-muted"
                  >
                    原路径：{{ file.old_path }}
                  </span>
                </span>
                <span class="shrink-0 text-ink-muted">{{
                  changeLabel(file.change_kind)
                }}</span>
              </button>
            </li>
          </ul>
          <p v-else class="m-0 text-xs text-ink-muted">
            当前变更没有可展示的文件内容。
          </p>
        </div>
      </template>

      <template v-else-if="uiStore.contextView === CodexContextView.Output">
        <p
          v-if="commandItems.length === 0"
          class="m-0 py-10 text-center text-xs text-ink-muted"
        >
          当前会话还没有命令输出。
        </p>
        <div v-else class="grid gap-3">
          <select
            :value="selectedCommand?.header.item_id || ''"
            class="h-9 w-full min-w-0 rounded-md border border-line bg-surface px-2 text-xs"
            aria-label="选择命令输出"
            @change="selectCommand"
          >
            <option
              v-for="item in commandItems"
              :key="item.header.item_id"
              :value="item.header.item_id"
            >
              {{ item.detail.command || '命令执行' }}
            </option>
          </select>
          <CodexCommandOutput v-if="selectedCommand" :item="selectedCommand" />
        </div>
      </template>

      <template v-else>
        <p
          v-if="contextApprovals.length === 0"
          class="m-0 py-10 text-center text-xs text-ink-muted"
        >
          当前会话没有待处理或交付中的审批。
        </p>
        <div v-else class="grid gap-3">
          <CodexApprovalCard
            v-for="approval in contextApprovals"
            :key="approval.approval_id"
            :approval="approval"
          />
        </div>
      </template>
    </div>
  </aside>
</template>

<script setup lang="ts">
import {
  ArrowLeft,
  FileCode2,
  FileDiff,
  ShieldCheck,
  TerminalSquare,
  X,
} from '@lucide/vue'
import {
  CodexDiffChangeKind,
  CodexTimelineItemKind,
  type CodexCommandTimelineItem,
  type CodexDiffFile,
  type CodexDiffTimelineItem,
} from '~/types/codex-item'
import { CodexApprovalState, type CodexApproval } from '~/types/codex-approval'
import { CodexContextView } from '~/stores/codex-ui'

const sessionStore = useCodexSessionStore()
const approvalStore = useCodexApprovalsStore()
const uiStore = useCodexUiStore()
const route = useRoute()

const diffItems = computed<CodexDiffTimelineItem[]>(() =>
  sessionStore.selectedTimeline.filter(
    (item): item is CodexDiffTimelineItem =>
      item.detail.kind === CodexTimelineItemKind.Diff,
  ),
)
const commandItems = computed<CodexCommandTimelineItem[]>(() =>
  sessionStore.selectedTimeline.filter(
    (item): item is CodexCommandTimelineItem =>
      item.detail.kind === CodexTimelineItemKind.Command,
  ),
)
const pendingApprovals = computed(() =>
  sessionStore.selectedThreadId
    ? approvalStore.pendingForThread(sessionStore.selectedThreadId)
    : [],
)
const contextApprovals = computed<CodexApproval[]>(() =>
  sessionStore.selectedThreadId
    ? Object.values(approvalStore.approvalsById)
        .filter(
          (approval) =>
            approval.thread_id === sessionStore.selectedThreadId &&
            [
              CodexApprovalState.Pending,
              CodexApprovalState.Claimed,
              CodexApprovalState.DeliveryFailed,
            ].includes(approval.state),
        )
        .sort(
          (left, right) =>
            right.updated_at.localeCompare(left.updated_at) ||
            right.approval_id.localeCompare(left.approval_id),
        )
    : [],
)
const selectedDiff = computed(
  () =>
    diffItems.value.find(
      (item) => item.header.item_id === uiStore.selectedContextItemId,
    ) ??
    diffItems.value.at(-1) ??
    null,
)
const selectedCommand = computed(
  () =>
    commandItems.value.find(
      (item) => item.header.item_id === uiStore.selectedContextItemId,
    ) ??
    commandItems.value.at(-1) ??
    null,
)
/** diffFile 只记录当前页面选择，避免将 Diff 正文或文件内容复制到浏览器存储。 */
const selectedDiffFile = computed<CodexDiffFile | null>(() => {
  const path =
    typeof route.query.diffFile === 'string' ? route.query.diffFile : null
  if (!path) return null
  return (
    selectedDiff.value?.detail.diff.files.find((file) => file.path === path) ??
    null
  )
})
const tabs = computed(() => [
  {
    view: CodexContextView.Changes,
    label: '变更',
    icon: FileDiff,
    count: diffItems.value.length,
  },
  {
    view: CodexContextView.Output,
    label: '输出',
    icon: TerminalSquare,
    count: commandItems.value.length,
  },
  {
    view: CodexContextView.Approvals,
    label: '审批',
    icon: ShieldCheck,
    count: pendingApprovals.value.length,
  },
])

const selectDiff = (event: Event): void => {
  selectContextRoute(
    CodexContextView.Changes,
    (event.target as HTMLSelectElement).value,
  )
}

const selectCommand = (event: Event): void => {
  selectContextRoute(
    CodexContextView.Output,
    (event.target as HTMLSelectElement).value,
  )
}

const DIFF_CHANGE_LABELS: Readonly<Record<CodexDiffChangeKind, string>> = {
  [CodexDiffChangeKind.Added]: '新增',
  [CodexDiffChangeKind.Deleted]: '删除',
  [CodexDiffChangeKind.Modified]: '修改',
  [CodexDiffChangeKind.Renamed]: '重命名',
}

const changeLabel = (changeKind: CodexDiffChangeKind): string =>
  DIFF_CHANGE_LABELS[changeKind]

/** 使用 replace 保持面板切换不污染历史栈，同时让深链成为唯一状态来源。 */
const selectContextRoute = (
  view: CodexContextView,
  selectedItemId: string | null = null,
): void => {
  uiStore.selectContext(view, selectedItemId)
  const query: Record<string, string | string[] | undefined> = {
    ...route.query,
    context: view,
  }
  if (selectedItemId) query.contextItem = selectedItemId
  else delete query.contextItem
  delete query.diffFile
  void navigateTo(
    { path: route.path, query, hash: route.hash },
    { replace: true },
  )
}

/** 文件预览使用独立历史状态，使浏览器返回操作恢复文件列表而不影响时间线布局。 */
const openDiffFile = (filePath: string): void => {
  if (!selectedDiff.value) return
  uiStore.selectContext(
    CodexContextView.Changes,
    selectedDiff.value.header.item_id,
  )
  const query: Record<string, string | string[] | undefined> = {
    ...route.query,
    context: CodexContextView.Changes,
    contextItem: selectedDiff.value.header.item_id,
    diffFile: filePath,
  }
  void navigateTo({ path: route.path, query, hash: route.hash })
}

const returnToDiffFileList = (): void => {
  const query = { ...route.query }
  delete query.diffFile
  void navigateTo({ path: route.path, query, hash: route.hash })
}

const closeContextRoute = (): void => {
  uiStore.closeContext()
  const query = { ...route.query }
  delete query.context
  delete query.contextItem
  delete query.diffFile
  void navigateTo(
    { path: route.path, query, hash: route.hash },
    { replace: true },
  )
}
</script>
