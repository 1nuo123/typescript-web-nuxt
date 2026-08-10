<template>
  <section
    class="grid grid-cols-[0.25rem_minmax(0,1fr)] overflow-hidden rounded-lg border border-line"
    :class="[`app-alert app-alert--${variant}`, surfaceClasses[variant]]"
    :role="alertRole"
  >
    <div :class="markerClasses[variant]" aria-hidden="true" />
    <div class="grid min-w-0 gap-2 p-4">
      <p v-if="title" class="m-0 font-extrabold leading-snug">{{ title }}</p>
      <p v-if="description" class="m-0 text-sm leading-relaxed text-ink-muted">
        {{ description }}
      </p>
      <div v-if="$slots.default" class="flex flex-wrap gap-2">
        <slot />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
type AlertVariant = 'info' | 'success' | 'warning' | 'danger'

const props = withDefaults(
  defineProps<{
    title?: string
    description?: string
    variant?: AlertVariant
  }>(),
  {
    title: '',
    description: '',
    variant: 'info',
  },
)

const surfaceClasses: Record<AlertVariant, string> = {
  info: 'bg-surface-muted',
  success: 'bg-surface-muted',
  warning:
    'bg-[color-mix(in_srgb,var(--ui-warning-soft)_56%,var(--ui-surface))]',
  danger: 'bg-[color-mix(in_srgb,var(--ui-danger-soft)_56%,var(--ui-surface))]',
}

const markerClasses: Record<AlertVariant, string> = {
  info: 'bg-ink-muted',
  success: 'bg-ink-muted',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

const alertRole = computed(() =>
  props.variant === 'danger' ? 'alert' : 'status',
)
</script>
