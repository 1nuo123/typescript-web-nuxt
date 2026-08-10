<template>
  <div
    class="skeleton-shimmer block max-w-full animate-shimmer overflow-hidden"
    :class="[`app-skeleton app-skeleton--${shape}`, shapeClasses[shape]]"
    :style="style"
    aria-hidden="true"
  />
</template>

<script setup lang="ts">
type SkeletonShape = 'line' | 'block' | 'circle'

const props = withDefaults(
  defineProps<{
    width?: string
    height?: string
    shape?: SkeletonShape
  }>(),
  {
    width: '100%',
    height: '1rem',
    shape: 'line',
  },
)

const shapeClasses: Record<SkeletonShape, string> = {
  line: 'rounded-md',
  block: 'rounded-lg',
  circle: 'aspect-square rounded-full',
}

const style = computed(() => ({
  width: props.width,
  height: props.height,
}))
</script>
