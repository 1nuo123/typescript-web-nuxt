<template>
  <section class="rounded-lg border border-line bg-surface p-3">
    <p v-if="item.detail.explanation" class="mt-0 text-sm text-ink-muted">
      {{ item.detail.explanation }}
    </p>
    <ol class="m-0 grid list-none gap-2 p-0">
      <li
        v-for="(step, index) in item.detail.steps"
        :key="`${index}-${step.step}`"
        class="flex gap-2 text-sm"
      >
        <span aria-hidden="true">{{
          step.status === 'completed'
            ? '✓'
            : step.status === 'in_progress'
              ? '●'
              : '○'
        }}</span>
        <span>{{ step.step }}</span>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import type { CodexPlanTimelineItem } from '~/types/codex-item'

defineProps<{ item: CodexPlanTimelineItem }>()
</script>
