<template>
  <button
    class="inline-flex max-w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-transparent font-semibold leading-none transition-[color,background-color,border-color,box-shadow,transform] duration-150 outline-none focus-visible:ring-[3px] focus-visible:ring-primary/20 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none"
    :class="[
      `base-button base-button--${variant} base-button--${size}`,
      variantClasses[variant],
      icon ? iconSizeClasses[size] : sizeClasses[size],
      { 'base-button--icon': icon },
    ]"
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
  >
    <BaseLoading v-if="loading" size="sm" label="加载中" hide-label />
    <span
      class="inline-flex min-w-0 items-center justify-center whitespace-nowrap"
    >
      <slot />
    </span>
  </button>
</template>

<script setup lang="ts">
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'
type ButtonType = 'button' | 'submit' | 'reset'

withDefaults(
  defineProps<{
    variant?: ButtonVariant
    size?: ButtonSize
    type?: ButtonType
    loading?: boolean
    disabled?: boolean
    icon?: boolean
  }>(),
  {
    variant: 'primary',
    size: 'md',
    type: 'button',
    loading: false,
    disabled: false,
    icon: false,
  },
)

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-canvas shadow-[0_1px_2px_rgb(18_24_33/0.12),0_4px_12px_color-mix(in_srgb,var(--ui-primary)_18%,transparent)] enabled:hover:bg-primary-strong enabled:hover:shadow-[0_2px_4px_rgb(18_24_33/0.14),0_6px_16px_color-mix(in_srgb,var(--ui-primary)_22%,transparent)]',
  secondary:
    'border-line-strong bg-surface text-ink shadow-[0_1px_2px_rgb(18_24_33/0.05)] enabled:hover:border-ink-muted/45 enabled:hover:bg-surface-muted',
  ghost:
    'bg-transparent text-ink-muted enabled:hover:bg-surface-muted enabled:hover:text-ink',
  danger:
    'bg-danger text-white shadow-[0_1px_2px_rgb(18_24_33/0.12)] enabled:hover:brightness-95',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-8 min-w-9 px-3 text-[0.8125rem]',
  md: 'min-h-10 min-w-10 px-4 text-[0.9rem]',
  lg: 'min-h-11 min-w-10 px-5 text-[0.95rem]',
}

const iconSizeClasses: Record<ButtonSize, string> = {
  sm: 'aspect-square min-h-8 min-w-8 p-0 text-[0.8125rem]',
  md: 'aspect-square min-h-10 min-w-10 p-0 text-[0.9rem]',
  lg: 'aspect-square min-h-11 min-w-11 p-0 text-[0.95rem]',
}
</script>
