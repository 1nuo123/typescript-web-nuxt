<template>
  <label class="base-field grid min-w-0 gap-1.5" :for="inputId">
    <span v-if="label" class="text-[0.8125rem] font-semibold text-ink">{{
      label
    }}</span>
    <span class="flex min-w-0">
      <input
        :id="inputId"
        v-model="model"
        class="min-h-10 w-full min-w-0 rounded-md border border-line-strong bg-surface px-3 text-[0.9rem] text-ink shadow-[0_1px_2px_rgb(18_24_33/0.04)] transition-[border-color,box-shadow,background-color] outline-none placeholder:text-ink-muted/65 hover:border-ink-muted/55 focus:border-primary focus:ring-[3px] focus:ring-primary/15 disabled:border-line disabled:bg-surface-muted disabled:text-ink-muted disabled:shadow-none"
        :class="{ 'border-danger': Boolean(error) }"
        :type="type"
        :name="name"
        :placeholder="placeholder"
        :disabled="disabled"
        :autocomplete="autocomplete"
        :aria-invalid="Boolean(error) || undefined"
        :aria-describedby="descriptionId"
      />
    </span>
    <span
      v-if="error"
      :id="errorId"
      class="text-[0.8125rem] leading-normal text-danger"
    >
      {{ error }}
    </span>
    <span
      v-else-if="hint"
      :id="hintId"
      class="text-[0.8125rem] leading-normal text-ink-muted"
    >
      {{ hint }}
    </span>
  </label>
</template>

<script setup lang="ts">
type InputType =
  | 'text'
  | 'email'
  | 'password'
  | 'search'
  | 'url'
  | 'tel'
  | 'datetime-local'

const model = defineModel<string>({ default: '' })

const props = withDefaults(
  defineProps<{
    id?: string
    name?: string
    label?: string
    hint?: string
    error?: string
    placeholder?: string
    autocomplete?: string
    type?: InputType
    disabled?: boolean
  }>(),
  {
    id: '',
    name: '',
    label: '',
    hint: '',
    error: '',
    placeholder: '',
    autocomplete: '',
    type: 'text',
    disabled: false,
  },
)

const fallbackId = useId()
const inputId = computed(() => props.id || `input-${fallbackId}`)
const hintId = computed(() => `${inputId.value}-hint`)
const errorId = computed(() => `${inputId.value}-error`)
const descriptionId = computed(() => {
  if (props.error) {
    return errorId.value
  }

  return props.hint ? hintId.value : undefined
})
</script>
