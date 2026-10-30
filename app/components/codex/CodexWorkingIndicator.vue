<template>
  <article
    class="codex-message flex w-full min-w-0 max-w-full gap-3 overflow-hidden px-1 py-3"
    role="status"
    aria-live="polite"
    :aria-label="`Codex ${label}`"
  >
    <div class="min-w-0 max-w-full overflow-hidden">
      <div
        class="codex-markdown break-words text-[0.9375rem] leading-7 text-ink-muted"
      >
        <CodexMarkdown :source="label" :streaming="true" />
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ label?: string }>(), { label: '正在处理' })
</script>
