<template>
  <div
    class="codex-reading-column flex w-full min-w-0 items-center gap-2 border-t border-line px-1 py-3 text-xs text-ink-muted"
    role="status"
    aria-live="polite"
    :aria-label="`Codex ${label}`"
  >
    <LoaderCircle
      class="size-3.5 shrink-0 animate-spin text-accent"
      aria-hidden="true"
    />
    <span class="min-w-0 break-words">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
import { LoaderCircle } from '@lucide/vue'
withDefaults(defineProps<{ label?: string }>(), { label: '正在处理' })
</script>
