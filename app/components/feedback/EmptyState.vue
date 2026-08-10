<template>
  <section
    class="mx-auto grid w-[min(100%,38rem)] justify-items-start gap-3 px-4 py-[clamp(2rem,7vw,5rem)]"
  >
    <p
      v-if="eyebrow"
      class="m-0 text-xs font-extrabold uppercase leading-tight text-primary"
    >
      {{ eyebrow }}
    </p>
    <h1
      class="m-0 text-[1.75rem] font-extrabold leading-tight text-ink md:text-4xl"
    >
      {{ title }}
    </h1>
    <p v-if="description" class="m-0 leading-relaxed text-ink-muted">
      {{ description }}
    </p>
    <div v-if="$slots.default" class="flex flex-wrap gap-3 pt-2">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    eyebrow?: string
    title: string
    description?: string
  }>(),
  {
    eyebrow: '',
    description: '',
  },
)
</script>
