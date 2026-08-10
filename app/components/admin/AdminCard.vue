<template>
  <component
    :is="tag"
    class="grid min-w-0 gap-4 rounded-lg border border-line bg-surface p-[clamp(1rem,2vw,1.25rem)] shadow-card"
    :class="spanClasses[span]"
  >
    <h2 v-if="title" class="m-0 text-[0.95rem] font-bold leading-snug text-ink">
      {{ title }}
    </h2>
    <p v-if="description" class="m-0 text-sm leading-relaxed text-ink-muted">
      {{ description }}
    </p>
    <slot />
  </component>
</template>

<script setup lang="ts">
type AdminCardSpan = 4 | 6 | 12
type AdminCardTag = 'section' | 'article' | 'div'

withDefaults(
  defineProps<{
    title?: string
    description?: string
    span?: AdminCardSpan
    tag?: AdminCardTag
  }>(),
  {
    title: '',
    description: '',
    span: 12,
    tag: 'section',
  },
)

const spanClasses: Record<AdminCardSpan, string> = {
  4: 'lg:col-span-4',
  6: 'lg:col-span-6',
  12: 'lg:col-span-12',
}
</script>
