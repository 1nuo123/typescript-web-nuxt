<template>
  <NuxtErrorBoundary @error="captureError">
    <CodexTimelineItem
      :item="item"
      @open-context="(itemId, kind) => $emit('open-context', itemId, kind)"
    />
    <template #error="{ clearError }">
      <article
        class="mx-1 my-2 grid gap-2 rounded-md border border-danger/30 bg-danger-soft p-3 text-sm"
      >
        <p class="m-0 font-medium text-danger">该条内容暂时无法展示</p>
        <p class="m-0 text-xs text-ink-muted">
          已隔离此条渲染错误，会话其余内容仍可继续使用。
        </p>
        <BaseButton size="sm" variant="secondary" @click="clearError">
          重试此条
        </BaseButton>
      </article>
    </template>
  </NuxtErrorBoundary>
</template>

<script setup lang="ts">
import type {
  CodexTimelineItem,
  CodexTimelineItemKind,
} from '~/types/codex-item'
import { RuntimeLogSource } from '~/types/app'

const props = defineProps<{ item: CodexTimelineItem }>()
defineEmits<{
  'open-context': [itemId: string, kind: CodexTimelineItemKind]
}>()
const logger = useClientLogger()

const captureError = (error: unknown): void => {
  logger.capture(error, {
    source: RuntimeLogSource.Vue,
    code: 'codex.timeline.item_render_failed',
    threadId: props.item.header.thread_id,
    turnId: props.item.header.turn_id ?? undefined,
    itemId: props.item.header.item_id,
    eventType: props.item.detail.kind,
  })
}
</script>
