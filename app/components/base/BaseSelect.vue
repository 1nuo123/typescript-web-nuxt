<template>
  <label class="base-field grid min-w-0 gap-1.5" :for="selectId">
    <span v-if="label" class="text-[0.8125rem] font-semibold text-ink">{{
      label
    }}</span>
    <span class="relative flex min-w-0">
      <select
        :id="selectId"
        v-model="model"
        class="min-h-10 w-full min-w-0 cursor-pointer appearance-none rounded-md border border-line-strong bg-surface py-0 pr-10 pl-3 text-[0.9rem] text-ink shadow-[0_1px_2px_rgb(18_24_33/0.04)] transition-[border-color,box-shadow,background-color] outline-none hover:border-ink-muted/55 focus:border-primary focus:ring-[3px] focus:ring-primary/15 disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-muted disabled:text-ink-muted disabled:shadow-none"
        :name="name"
        :disabled="disabled"
        :aria-label="!label ? ariaLabel : undefined"
      >
        <option
          v-for="option in options"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>
      <ChevronDown
        class="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-muted"
        aria-hidden="true"
      />
    </span>
    <span v-if="hint" class="text-[0.8125rem] leading-normal text-ink-muted">
      {{ hint }}
    </span>
  </label>
</template>

<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'

export interface BaseSelectOption {
  value: string
  label: string
}

const model = defineModel<string>({ default: '' })

const props = withDefaults(
  defineProps<{
    options: BaseSelectOption[]
    id?: string
    name?: string
    label?: string
    hint?: string
    ariaLabel?: string
    disabled?: boolean
  }>(),
  {
    id: '',
    name: '',
    label: '',
    hint: '',
    ariaLabel: '',
    disabled: false,
  },
)

const fallbackId = useId()
const selectId = computed(() => props.id || `select-${fallbackId}`)
</script>
