<template>
  <section
    class="grid gap-6 rounded-xl border border-line bg-surface/96 p-[clamp(1.5rem,4vw,2rem)] shadow-pop backdrop-blur-xl"
    :aria-labelledby="titleId"
  >
    <div class="grid gap-2">
      <p v-if="eyebrow" class="m-0 text-xs font-bold text-primary">
        {{ eyebrow }}
      </p>
      <h1
        :id="titleId"
        class="m-0 text-[1.9rem] font-bold leading-tight text-ink"
      >
        {{ title }}
      </h1>
      <p
        v-if="description"
        class="m-0 text-[0.95rem] leading-relaxed text-ink-muted"
      >
        {{ description }}
      </p>
    </div>

    <slot />
  </section>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    titleId: string
    eyebrow?: string
    description?: string
  }>(),
  {
    eyebrow: '',
    description: '',
  },
)
</script>
