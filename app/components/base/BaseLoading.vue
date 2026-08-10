<template>
  <span
    class="inline-flex items-center gap-2 text-sm leading-none text-current"
    role="status"
  >
    <span
      class="inline-block aspect-square animate-spin rounded-full border-2 border-current border-r-transparent"
      :class="spinnerSizeClasses[size]"
      aria-hidden="true"
    />
    <span :class="{ 'sr-only': hideLabel }">{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
type LoadingSize = 'sm' | 'md' | 'lg'

withDefaults(
  defineProps<{
    label?: string
    size?: LoadingSize
    hideLabel?: boolean
  }>(),
  {
    label: '加载中',
    size: 'md',
    hideLabel: false,
  },
)

const spinnerSizeClasses: Record<LoadingSize, string> = {
  sm: 'w-3.5',
  md: 'w-4',
  lg: 'w-5',
}
</script>
