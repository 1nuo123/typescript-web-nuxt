<template>
  <section class="grid min-w-0 gap-3" aria-label="文件变更">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <label class="sr-only" :for="fileSelectId">选择变更文件</label>
      <span class="relative flex min-w-0 max-w-full">
        <select
          :id="fileSelectId"
          v-model="selectedFileIndex"
          class="min-h-9 min-w-0 max-w-full cursor-pointer appearance-none rounded-md border border-line-strong bg-surface py-1 pr-9 pl-3 text-xs text-ink shadow-[0_1px_2px_rgb(18_24_33/0.04)] outline-none transition-[border-color,box-shadow] hover:border-ink-muted/55 focus:border-primary focus:ring-[3px] focus:ring-primary/15"
        >
          <option
            v-for="(file, index) in item.detail.diff.files"
            :key="file.path"
            :value="index"
          >
            {{ file.path }}
          </option>
        </select>
        <ChevronDown
          class="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-ink-muted"
          aria-hidden="true"
        />
      </span>
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
      v-if="selectedFile"
      class="min-w-0 overflow-x-auto rounded-lg border border-line bg-surface"
    >
      <p v-if="selectedFile.binary" class="m-0 p-4 text-sm text-ink-muted">
        二进制文件，无法在线预览。
      </p>
      <p v-else-if="selectedFile.large" class="m-0 p-4 text-sm text-ink-muted">
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
    <p
      v-else
      class="m-0 rounded-md border border-line bg-surface-muted p-3 text-sm text-ink-muted"
    >
      当前变更没有可展示的文件内容。
    </p>
    <BaseButton
      v-if="hiddenLineCount > 0"
      size="sm"
      variant="secondary"
      class="justify-self-start"
      @click="visibleLineLimit += DIFF_LINE_CHUNK_SIZE"
    >
      再加载 {{ Math.min(hiddenLineCount, DIFF_LINE_CHUNK_SIZE) }} 行
    </BaseButton>
    <p
      v-if="item.detail.diff.truncated || selectedFile?.truncated"
      class="m-0 text-xs text-ink-muted"
    >
      变更已截断，请在本机 Codex 中查看完整内容。
    </p>
  </section>
</template>

<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'
import {
  CodexDiffLineKind,
  type CodexDiffTimelineItem,
} from '~/types/codex-item'

enum DiffViewMode {
  Unified = 'unified',
  Split = 'split',
}

const props = defineProps<{ item: CodexDiffTimelineItem }>()
const viewMode = ref<DiffViewMode>(DiffViewMode.Unified)
const selectedFileIndex = ref(0)
const DIFF_LINE_CHUNK_SIZE = 800
const visibleLineLimit = ref(DIFF_LINE_CHUNK_SIZE)
const fileSelectId = useId()
const modes = [
  { value: DiffViewMode.Unified, label: '统一' },
  { value: DiffViewMode.Split, label: '分栏' },
]
const selectedFile = computed(
  () => props.item.detail.diff.files[selectedFileIndex.value] ?? null,
)
const totalLineCount = computed(
  () =>
    selectedFile.value?.hunks.reduce(
      (total, hunk) => total + hunk.lines.length,
      0,
    ) ?? 0,
)
const hiddenLineCount = computed(() =>
  Math.max(totalLineCount.value - visibleLineLimit.value, 0),
)
const visibleHunks = computed(() => {
  const file = selectedFile.value
  if (!file) return []
  let remaining = visibleLineLimit.value
  return file.hunks.flatMap((hunk) => {
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

watch(selectedFileIndex, () => {
  visibleLineLimit.value = DIFF_LINE_CHUNK_SIZE
})
</script>
