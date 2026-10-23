<template>
  <section
    class="codex-command min-w-0 max-w-full"
    :data-command-id="item.header.item_id"
  >
    <details
      :key="item.header.item_id"
      class="codex-process min-w-0 max-w-full"
      :open="expanded"
      @toggle="onToggle"
    >
      <summary class="codex-process-summary min-w-0 max-w-full break-all">
        <TerminalSquare class="size-3.5 shrink-0" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate font-mono">{{
          item.detail.command || '命令执行'
        }}</span>
        <span
          class="codex-command-status"
          :class="failed ? 'text-danger' : 'text-ink-muted'"
        >
          <LoaderCircle
            v-if="running"
            class="size-3 animate-spin"
            aria-hidden="true"
          />
          <span
            v-else
            class="size-1.5 rounded-full"
            :class="failed ? 'bg-danger' : 'bg-accent'"
            aria-hidden="true"
          />
          {{ statusLabel }}
        </span>
        <span
          v-if="item.detail.exit_code !== null"
          class="codex-exit-code"
          :class="failed ? 'text-danger' : 'text-ink-muted'"
          >退出码 {{ item.detail.exit_code }}</span
        >
        <ChevronRight
          class="codex-process-chevron size-3.5 shrink-0"
          aria-hidden="true"
        />
      </summary>
      <div class="codex-terminal">
        <header class="codex-terminal-header">
          <code class="min-w-0 flex-1 whitespace-pre-wrap break-all">{{
            item.detail.command || '命令执行'
          }}</code>
          <button
            type="button"
            class="codex-terminal-copy"
            :disabled="!item.detail.command"
            aria-label="复制命令"
            title="复制命令"
            @click="copyText(item.detail.command)"
          >
            <Copy class="size-3.5" aria-hidden="true" />
          </button>
        </header>
        <pre
          class="m-0 max-h-80 max-w-full overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-all px-4 py-3 font-mono text-xs leading-6 text-ink-muted"
          tabindex="0"
          aria-label="命令输出"
          >{{ item.detail.output || emptyOutputLabel }}</pre
        >
        <footer class="codex-terminal-footer">
          <span role="status" aria-live="polite">{{ copyFeedback }}</span>
          <button
            type="button"
            class="codex-terminal-copy"
            :disabled="!item.detail.output"
            @click="copyText(item.detail.output)"
          >
            复制输出
          </button>
        </footer>
      </div>
      <button
        v-if="showContextLink"
        type="button"
        class="codex-process-context"
        @click="$emit('open-context')"
      >
        <PanelRight class="size-3" aria-hidden="true" />在上下文中查看
      </button>
    </details>
  </section>
</template>

<script setup lang="ts">
import {
  ChevronRight,
  Copy,
  LoaderCircle,
  PanelRight,
  TerminalSquare,
} from '@lucide/vue'
import {
  CodexTimelineItemStatus,
  type CodexCommandTimelineItem,
} from '~/types/codex-item'

const props = withDefaults(
  defineProps<{
    item: CodexCommandTimelineItem
    showContextLink?: boolean
    persistExpansion?: boolean
  }>(),
  { showContextLink: false, persistExpansion: false },
)
defineEmits<{ 'open-context': [] }>()
const uiStore = useCodexUiStore()
const localExpanded = ref(false)
const expanded = computed(() =>
  props.persistExpansion
    ? uiStore.itemDisclosureOpen(
        props.item.header.thread_id,
        props.item.header.item_id,
      )
    : localExpanded.value,
)
const onToggle = (event: Event): void => {
  const open = (event.target as HTMLDetailsElement).open
  if (open === expanded.value) return
  if (props.persistExpansion)
    uiStore.setItemDisclosureOpen(
      props.item.header.thread_id,
      props.item.header.item_id,
      open,
    )
  else localExpanded.value = open
}
watch(
  () => props.item.header.item_id,
  () => {
    localExpanded.value = false
  },
  { flush: 'sync' },
)

const failed = computed(
  () =>
    props.item.header.status === CodexTimelineItemStatus.Failed ||
    (props.item.detail.exit_code !== null && props.item.detail.exit_code !== 0),
)
const running = computed(
  () =>
    !failed.value &&
    props.item.header.status === CodexTimelineItemStatus.Streaming,
)
const statusLabel = computed(() =>
  failed.value ? '执行失败' : running.value ? '执行中' : '执行完成',
)
const emptyOutputLabel = computed(() =>
  running.value ? '等待输出…' : `${statusLabel.value}，无输出`,
)
const copyFeedback = ref('')
let copyRequest = 0
watch(
  () => [
    props.item.header.item_id,
    props.item.detail.command,
    props.item.detail.output,
  ],
  () => {
    copyRequest += 1
    copyFeedback.value = ''
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => {
  copyRequest += 1
})
const copyText = async (text: string): Promise<void> => {
  const request = ++copyRequest
  copyFeedback.value = ''
  try {
    if (!navigator.clipboard) throw new Error('Clipboard unavailable')
    await navigator.clipboard.writeText(text)
    if (request === copyRequest) copyFeedback.value = '已复制'
  } catch {
    if (request === copyRequest)
      copyFeedback.value = '复制失败，请手动选择文本。'
  }
}
</script>
