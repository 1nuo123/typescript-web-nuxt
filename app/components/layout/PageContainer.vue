<template>
  <section
    class="grid"
    :class="[
      `page-container page-container--${density}`,
      density === 'compact' ? 'gap-3' : 'gap-5',
    ]"
  >
    <header
      v-if="title || eyebrow || description || $slots.actions"
      class="flex items-end justify-between gap-5 border-b border-line pb-5 max-md:grid max-md:items-start"
    >
      <div class="min-w-0">
        <p
          v-if="eyebrow"
          class="mb-1.5 text-[0.7rem] font-bold uppercase leading-tight text-primary"
        >
          {{ eyebrow }}
        </p>
        <h1
          v-if="title"
          class="m-0 text-[1.6rem] font-bold leading-tight text-ink md:text-[2rem]"
        >
          {{ title }}
        </h1>
        <p
          v-if="description"
          class="mt-2 mb-0 max-w-3xl text-[0.9rem] leading-relaxed text-ink-muted"
        >
          {{ description }}
        </p>
      </div>
      <div
        v-if="$slots.actions"
        class="flex flex-wrap justify-end gap-2 max-md:justify-start"
      >
        <slot name="actions" />
      </div>
    </header>

    <div class="grid gap-5">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
type ContainerDensity = 'comfortable' | 'compact'

withDefaults(
  defineProps<{
    title?: string
    eyebrow?: string
    description?: string
    density?: ContainerDensity
  }>(),
  {
    title: '',
    eyebrow: '',
    description: '',
    density: 'comfortable',
  },
)
</script>
