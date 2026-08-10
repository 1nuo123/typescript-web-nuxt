<template>
  <nav
    class="flex flex-wrap items-center justify-between gap-3"
    aria-label="分页"
  >
    <p class="m-0 text-sm text-ink-muted">
      共 {{ total }} 条 · 第 {{ currentPage }} / {{ totalPages }} 页
    </p>
    <div class="flex items-center gap-2">
      <BaseButton
        size="sm"
        variant="secondary"
        :disabled="disabled || offset <= 0"
        @click="goPrevious"
      >
        上一页
      </BaseButton>
      <BaseButton
        size="sm"
        variant="secondary"
        :disabled="disabled || !hasNext"
        @click="goNext"
      >
        下一页
      </BaseButton>
    </div>
  </nav>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    total: number
    pageSize: number
    offset: number
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const emit = defineEmits<{
  change: [offset: number]
}>()

const totalPages = computed(() =>
  Math.max(1, Math.ceil(props.total / Math.max(1, props.pageSize))),
)
const currentPage = computed(
  () => Math.floor(props.offset / Math.max(1, props.pageSize)) + 1,
)
const hasNext = computed(() => props.offset + props.pageSize < props.total)

const goPrevious = () => {
  emit('change', Math.max(0, props.offset - props.pageSize))
}

const goNext = () => {
  if (hasNext.value) {
    emit('change', props.offset + props.pageSize)
  }
}
</script>
