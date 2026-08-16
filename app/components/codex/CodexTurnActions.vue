<template>
  <div v-if="active" class="flex items-center gap-2">
    <span class="hidden items-center gap-1.5 text-xs text-ink-muted sm:flex">
      <span class="size-1.5 animate-pulse rounded-full bg-accent" />
      正在运行
    </span>
    <BaseButton
      variant="danger"
      size="sm"
      :disabled="interrupting"
      title="中断当前会话"
      @click="$emit('interrupt')"
    >
      <Square class="size-3" fill="currentColor" aria-hidden="true" />
      {{ interrupting ? '中断中…' : '中断' }}
    </BaseButton>
  </div>
</template>

<script setup lang="ts">
import { Square } from '@lucide/vue'

withDefaults(defineProps<{ active: boolean; interrupting?: boolean }>(), {
  interrupting: false,
})
defineEmits<{ interrupt: [] }>()
</script>
