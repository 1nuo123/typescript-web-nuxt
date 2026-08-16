<template>
  <form
    class="min-w-0 max-w-full overflow-hidden rounded-lg border border-line-strong bg-surface shadow-[0_8px_28px_rgb(20_24_31/0.08)] transition focus-within:border-primary"
    @submit.prevent="submit"
  >
    <label class="sr-only" :for="inputId">发送给 Codex</label>
    <textarea
      :id="inputId"
      v-model="draft"
      rows="3"
      :disabled="disabled || submitting"
      :placeholder="placeholder"
      class="min-h-20 w-full resize-none border-0 bg-transparent px-4 pt-3.5 pb-2 text-[0.9375rem] leading-6 text-ink outline-none placeholder:text-ink-muted focus:ring-0"
      @keydown.meta.enter.prevent="submit"
      @keydown.ctrl.enter.prevent="submit"
    />
    <div
      class="flex min-h-11 items-center justify-between gap-3 border-t border-line px-2.5 py-2"
    >
      <span class="flex items-center gap-2 px-1.5 text-xs text-ink-muted">
        <CornerDownLeft class="size-3.5" aria-hidden="true" />
        <span v-if="activeTurn">指令会加入当前会话</span>
        <span v-else class="hidden sm:inline">Ctrl/⌘ + Enter 发送</span>
      </span>
      <BaseButton
        type="submit"
        size="sm"
        :disabled="disabled || submitting || !draft.trim()"
      >
        <CornerDownRight
          v-if="activeTurn"
          class="size-3.5"
          aria-hidden="true"
        />
        <ArrowUp v-else class="size-3.5" aria-hidden="true" />
        <span>{{ activeTurn ? '追加指令' : '发送' }}</span>
      </BaseButton>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ArrowUp, CornerDownLeft, CornerDownRight } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    disabled?: boolean
    submitting?: boolean
    activeTurn?: boolean
  }>(),
  { disabled: false, submitting: false, activeTurn: false },
)
const emit = defineEmits<{
  'update:modelValue': [value: string]
  submit: [message: string]
}>()
const inputId = useId()
const draft = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
})
const placeholder = computed(() =>
  props.disabled
    ? '主机离线，草稿会保留在当前页面。'
    : props.activeTurn
      ? '向正在运行的会话追加指令…'
      : '描述要在本机完成的工作…',
)
const submit = (): void => {
  const message = draft.value.trim()
  if (!message || props.disabled || props.submitting) return
  emit('submit', message)
}
</script>
