<template>
  <aside
    class="fixed top-16 left-1/2 z-40 flex w-[min(92vw,42rem)] -translate-x-1/2 items-center gap-3 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning shadow-pop"
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

/** 固定提示条只提供导航，不在会话时间线内渲染审批内容或决策控件。 */
defineProps<{
  count: number
}>()

defineEmits<{
  open: []
}>()
</script>
