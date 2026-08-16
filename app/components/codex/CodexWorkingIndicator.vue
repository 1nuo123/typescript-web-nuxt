<template>
  <div
    class="flex w-full min-w-0 items-center gap-3 px-1 py-3"
    role="status"
    aria-live="polite"
    aria-label="Codex 正在处理"
  >
    <div
      class="grid size-7 shrink-0 place-items-center rounded-md border border-line bg-surface text-ink-muted"
      aria-hidden="true"
    >
      <Bot class="size-3.5" />
    </div>
    <div class="min-w-0 px-1">
      <div class="flex items-center gap-2 text-[0.6875rem] font-medium">
        <span class="text-ink-muted">Codex</span>
        <span class="text-ink">正在处理</span>
      </div>
      <div class="mt-2 flex h-2 items-center gap-1" aria-hidden="true">
        <span
          v-for="delay in dotDelays"
          :key="delay"
          class="codex-working-dot size-1.5 rounded-full bg-ink-muted"
          :style="{ animationDelay: delay }"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Bot } from '@lucide/vue'

const dotDelays = ['0ms', '160ms', '320ms']
</script>

<style scoped>
.codex-working-dot {
  animation: codex-working-dot 1.2s ease-in-out infinite;
}

@keyframes codex-working-dot {
  0%,
  60%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }

  30% {
    opacity: 1;
    transform: translateY(-0.2rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .codex-working-dot {
    animation: none;
    opacity: 0.7;
  }
}
</style>
