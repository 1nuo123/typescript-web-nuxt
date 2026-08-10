<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150"
      leave-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="base-modal fixed inset-0 z-60 grid place-items-center p-4"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="title ? titleId : undefined"
        :aria-describedby="description ? descriptionId : undefined"
        @keydown.esc="$emit('close')"
        @keydown.tab="handleTab"
      >
        <button
          class="base-modal__backdrop absolute inset-0 border-0 bg-[rgb(20_24_31/0.58)]"
          type="button"
          aria-label="关闭弹窗"
          @click="$emit('close')"
        />
        <section
          ref="panelElement"
          class="relative grid max-h-[min(42rem,calc(100vh-2rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
          :class="panelSizeClasses[size]"
          tabindex="-1"
        >
          <header
            class="flex items-start justify-between gap-4 border-b border-line p-5"
          >
            <div>
              <h2
                v-if="title"
                :id="titleId"
                class="m-0 text-base font-extrabold leading-snug"
              >
                {{ title }}
              </h2>
              <p
                v-if="description"
                :id="descriptionId"
                class="mt-1 mb-0 text-sm leading-relaxed text-ink-muted"
              >
                {{ description }}
              </p>
            </div>
            <BaseButton
              icon
              variant="ghost"
              size="sm"
              aria-label="关闭弹窗"
              title="关闭弹窗"
              @click="$emit('close')"
            >
              <X class="size-4" aria-hidden="true" />
            </BaseButton>
          </header>
          <div class="overflow-auto p-5">
            <slot />
          </div>
          <footer
            v-if="$slots.footer"
            class="flex flex-wrap items-center justify-end gap-3 border-t border-line bg-surface-muted/45 p-5"
          >
            <slot name="footer" />
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { X } from '@lucide/vue'

type ModalSize = 'sm' | 'md' | 'lg'

const props = withDefaults(
  defineProps<{
    open?: boolean
    title?: string
    description?: string
    size?: ModalSize
  }>(),
  {
    open: false,
    title: '',
    description: '',
    size: 'md',
  },
)

defineEmits<{
  close: []
}>()

const panelSizeClasses: Record<ModalSize, string> = {
  sm: 'w-[min(100%,28rem)]',
  md: 'w-[min(100%,34rem)]',
  lg: 'w-[min(100%,48rem)]',
}

const fallbackId = useId()
const panelElement = ref<HTMLElement | null>(null)
const previousActiveElement = ref<HTMLElement | null>(null)
const previousBodyOverflow = ref<string | null>(null)
const titleId = computed(() => `modal-${fallbackId}-title`)
const descriptionId = computed(() => `modal-${fallbackId}-description`)

const focusableSelector = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const getFocusableElements = () => {
  return Array.from(
    panelElement.value?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
  ).filter((element) => !element.hasAttribute('disabled'))
}

const restoreDocumentState = () => {
  if (!import.meta.client) {
    return
  }

  if (previousBodyOverflow.value !== null) {
    document.body.style.overflow = previousBodyOverflow.value
    previousBodyOverflow.value = null
  }

  previousActiveElement.value?.focus()
  previousActiveElement.value = null
}

const handleTab = (event: KeyboardEvent) => {
  const focusableElements = getFocusableElements()

  if (!focusableElements.length) {
    event.preventDefault()
    panelElement.value?.focus()
    return
  }

  const firstElement = focusableElements.at(0)
  const lastElement = focusableElements.at(-1)

  if (!firstElement) {
    return
  }

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault()
    lastElement?.focus()
    return
  }

  if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault()
    firstElement.focus()
  }
}

watch(
  () => props.open,
  async (isOpen) => {
    if (!import.meta.client) {
      return
    }

    if (isOpen) {
      previousActiveElement.value =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      previousBodyOverflow.value = document.body.style.overflow
      document.body.style.overflow = 'hidden'

      await nextTick()

      const focusTarget = getFocusableElements()[0] ?? panelElement.value
      focusTarget?.focus()
      return
    }

    restoreDocumentState()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  restoreDocumentState()
})
</script>
