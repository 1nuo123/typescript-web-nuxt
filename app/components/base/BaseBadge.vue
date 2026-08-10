<template>
  <span
    class="inline-flex min-h-6 items-center justify-center whitespace-nowrap rounded-full px-2.5 text-xs font-extrabold"
    :class="toneClasses[tone]"
  >
    <slot />
  </span>
</template>

<script setup lang="ts">
type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger'

withDefaults(
  defineProps<{
    tone?: BadgeTone
  }>(),
  {
    tone: 'neutral',
  },
)

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted text-ink-muted',
  primary: 'bg-primary-soft text-ink',
  success: 'bg-accent-soft text-ink-muted',
  warning: 'bg-warning-soft/85 text-warning',
  danger: 'bg-danger-soft/85 text-danger',
}
</script>
