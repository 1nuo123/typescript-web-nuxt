<template>
  <aside
    class="codex-approval-prompt mx-auto flex items-center gap-3 rounded-xl border border-warning/20 bg-warning-soft/60 px-3 py-2 text-sm text-warning"
    role="status"
    aria-live="polite"
  >
    <ShieldAlert class="size-4 shrink-0" aria-hidden="true" />
    <span class="min-w-0 flex-1"> {{ count }} 项审批等待处理 </span>
    <BaseButton
      size="sm"
      variant="secondary"
      class="shrink-0"
      @click="$emit('open')"
    >
      查看审批
    </BaseButton>
  </aside>
</template>

<script setup lang="ts">
import { ShieldAlert } from '@lucide/vue'

/** 提示条占据独立布局行，不遮挡消息；仅导航至既有审批 Surface。 */
defineProps<{
  count: number
}>()

defineEmits<{
  open: []
}>()
</script>
