<template>
  <section class="grid min-w-0 gap-3" aria-label="文件变更详情">
    <div class="flex flex-wrap items-center justify-end gap-2">
      <div
        class="inline-flex rounded-md border border-line p-0.5"
        role="tablist"
        aria-label="Diff布局"
      >
        <button
          v-for="mode in modes"
          :key="mode.value"
          type="button"
          role="tab"
          :aria-selected="viewMode === mode.value"
          class="rounded px-2 py-1 text-xs"
          :class="
            viewMode === mode.value
              ? 'bg-surface-muted font-medium'
              : 'text-ink-muted'
          "
          @click="viewMode = mode.value"
        >
          {{ mode.label }}
        </button>
      </div>
    </div>

    <div
      class="min-w-0 overflow-x-auto rounded-lg border border-line bg-surface"
    >
      <p v-if="file.binary" class="m-0 p-4 text-sm text-ink-muted">
        二进制文件，无法在线预览。
      </p>
      <p v-else-if="file.large" class="m-0 p-4 text-sm text-ink-muted">
        文件变更过大，已限制在线预览。
      </p>
      <div v-else class="min-w-[38rem] font-mono text-xs">
        <div v-for="hunk in visibleHunks" :key="hunk.header">
          <p
            class="m-0 border-b border-line bg-surface-muted px-3 py-1 text-primary"
          >
            {{ hunk.header }}
          </p>
          <template v-if="viewMode === DiffViewMode.Unified">
            <div
              v-for="(line, lineIndex) in hunk.lines"
              :key="`${hunk.header}-${lineIndex}`"
              class="grid grid-cols-[3.5rem_3.5rem_minmax(0,1fr)] whitespace-pre-wrap"
              :class="lineClass[line.kind]"
            >
              <span
                class="select-none border-r border-line px-2 py-0.5 text-right text-ink-muted"
                >{{ line.old_line_number ?? '' }}</span
              >
              <span
                class="select-none border-r border-line px-2 py-0.5 text-right text-ink-muted"
                >{{ line.new_line_number ?? '' }}</span
              >
              <span class="break-all px-3 py-0.5"
                >{{ prefix(line.kind) }}{{ line.content }}</span
              >
            </div>
          </template>
          <template v-else>
            <div
              v-for="(line, lineIndex) in hunk.lines"
              :key="`${hunk.header}-split-${lineIndex}`"
              class="grid grid-cols-2"
            >
              <span
                class="break-all border-r border-line px-3 py-0.5"
                :class="lineClass[line.kind]"
                >{{
                  line.old_line_number
                    ? `${line.old_line_number}  ${line.content}`
                    : ''
                }}</span
              >
              <span
                class="break-all px-3 py-0.5"
                :class="lineClass[line.kind]"
                >{{
                  line.new_line_number
                    ? `${line.new_line_number}  ${line.content}`
                    : ''
                }}</span
              >
            </div>
          </template>
        </div>
      </div>
    </div>
    <BaseButton
      v-if="hiddenLineCount > 0"
      size="sm"
      variant="secondary"
      class="justify-self-start"
      @click="visibleLineLimit += DIFF_LINE_CHUNK_SIZE"
    >
      再加载 {{ Math.min(hiddenLineCount, DIFF_LINE_CHUNK_SIZE) }} 行
    </BaseButton>
    <p v-if="truncated || file.truncated" class="m-0 text-xs text-ink-muted">
      变更已截断，请在本机 Codex 中查看完整内容。
    </p>
  </section>
</template>

<script setup lang="ts">
import { CodexDiffLineKind, type CodexDiffFile } from '~/types/codex-item'

enum DiffViewMode {
  Unified = 'unified',
  Split = 'split',
}

/** 仅渲染已由上下文页面选择的单个文件，避免文件切换与内容预览共同挤压主时间线。 */
const props = withDefaults(
  defineProps<{
    file: CodexDiffFile
    truncated?: boolean
  }>(),
  { truncated: false },
)
const viewMode = ref<DiffViewMode>(DiffViewMode.Unified)
const DIFF_LINE_CHUNK_SIZE = 800
const visibleLineLimit = ref(DIFF_LINE_CHUNK_SIZE)
const modes = [
  { value: DiffViewMode.Unified, label: '统一' },
  { value: DiffViewMode.Split, label: '分栏' },
]
const totalLineCount = computed(() =>
  props.file.hunks.reduce((total, hunk) => total + hunk.lines.length, 0),
)
const hiddenLineCount = computed(() =>
  Math.max(totalLineCount.value - visibleLineLimit.value, 0),
)
const visibleHunks = computed(() => {
  let remaining = visibleLineLimit.value
  return props.file.hunks.flatMap((hunk) => {
    if (remaining <= 0) return []
    const lines = hunk.lines.slice(0, remaining)
    remaining -= lines.length
    return [{ ...hunk, lines }]
  })
})
const lineClass: Record<CodexDiffLineKind, string> = {
  [CodexDiffLineKind.Context]: 'text-ink-muted',
  [CodexDiffLineKind.Addition]: 'bg-accent-soft text-accent',
  [CodexDiffLineKind.Deletion]: 'bg-danger-soft text-danger',
}
const prefix = (kind: CodexDiffLineKind): string =>
  kind === CodexDiffLineKind.Addition
    ? '+ '
    : kind === CodexDiffLineKind.Deletion
      ? '- '
      : '  '

watch(
  () => props.file.path,
  () => {
    visibleLineLimit.value = DIFF_LINE_CHUNK_SIZE
  },
)
</script>
