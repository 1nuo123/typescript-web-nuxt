<template>
  <aside
    id="app-sidebar"
    class="app-sidebar sticky top-0 z-40 h-screen min-w-0 border-r border-line bg-elevated max-lg:pointer-events-none max-lg:fixed max-lg:inset-0 max-lg:w-full max-lg:border-r-0 max-lg:bg-transparent"
    :class="{ 'app-sidebar--open': open, 'max-lg:pointer-events-auto': open }"
    :aria-hidden="navigationHidden || undefined"
    :inert="navigationHidden || undefined"
    @keydown="handleKeydown"
  >
    <div
      ref="panelElement"
      class="app-sidebar__panel relative z-1 flex h-full min-w-0 flex-col gap-4 p-4 max-lg:w-[min(19rem,calc(100vw-3rem))] max-lg:border-r max-lg:border-line max-lg:bg-elevated max-lg:transition-transform max-lg:duration-200"
      :class="open ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full'"
    >
      <div class="flex min-h-10 items-center justify-between gap-3">
        <span
          class="px-2 text-[0.7rem] font-bold uppercase leading-tight text-ink-muted"
        >
          导航
        </span>
        <BaseButton
          class="hidden max-lg:inline-flex"
          icon
          variant="ghost"
          size="sm"
          aria-label="关闭导航"
          title="关闭导航"
          @click="$emit('close')"
        >
          <X class="size-4" aria-hidden="true" />
        </BaseButton>
      </div>

      <nav class="grid gap-1" aria-label="次级导航">
        <NuxtLink
          v-for="item in items"
          :key="item.to"
          class="app-sidebar__link flex min-h-10 min-w-0 items-center rounded-md border border-transparent px-3 text-[0.85rem] font-semibold no-underline transition-colors hover:bg-surface-muted hover:text-ink"
          :class="
            isActive(item)
              ? 'border-primary/15 bg-primary-soft text-primary-strong'
              : 'text-ink-muted'
          "
          :to="item.to"
          :aria-disabled="item.disabled || undefined"
          @click="handleClick($event, item)"
        >
          {{ item.label }}
        </NuxtLink>
        <p
          v-if="!items.length && !$slots.default"
          class="m-0 rounded-md border border-dashed border-line p-4 text-sm leading-relaxed text-ink-muted"
        >
          导航插槽已准备好，可供功能模块接入。
        </p>
        <slot />
      </nav>
    </div>
    <button
      v-if="open"
      class="hidden max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:left-[min(19rem,calc(100vw-3rem))] max-lg:z-0 max-lg:block max-lg:border-0 max-lg:bg-[rgb(20_24_31/0.46)]"
      type="button"
      aria-label="关闭导航"
      @click="$emit('close')"
    />
  </aside>
</template>

<script setup lang="ts">
import { X } from '@lucide/vue'
import type { AppNavItem } from '~/types/app'
import { mediaMaxWidth } from '~/utils/breakpoints'

const props = withDefaults(
  defineProps<{
    open?: boolean
    items?: AppNavItem[]
  }>(),
  {
    open: false,
    items: () => [],
  },
)

const emit = defineEmits<{
  close: []
}>()

const route = useRoute()
const compactViewport = ref(false)
const panelElement = ref<HTMLElement | null>(null)
let compactMedia: MediaQueryList | undefined
let previouslyFocusedElement: HTMLElement | null = null

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const syncCompactViewport = () => {
  compactViewport.value = compactMedia?.matches ?? false
}

if (import.meta.client) {
  onMounted(() => {
    if (typeof window.matchMedia !== 'function') {
      return
    }

    compactMedia = window.matchMedia(mediaMaxWidth('lg'))
    syncCompactViewport()
    compactMedia.addEventListener('change', syncCompactViewport)
    window.addEventListener('keydown', handleGlobalKeydown)
  })

  onBeforeUnmount(() => {
    compactMedia?.removeEventListener('change', syncCompactViewport)
    window.removeEventListener('keydown', handleGlobalKeydown)
  })
}

const navigationHidden = computed(() => compactViewport.value && !props.open)

const isActive = (item: AppNavItem) => {
  if (item.exact) {
    return route.fullPath === item.to
  }

  if (item.to.includes('#')) {
    return route.fullPath === item.to
  }

  return route.path === item.to || route.path.startsWith(`${item.to}/`)
}

const handleClick = (event: MouseEvent, item: AppNavItem) => {
  if (item.disabled) {
    event.preventDefault()
    return
  }

  emit('close')
}

const getFocusableElements = () => {
  return Array.from(
    panelElement.value?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
  ).filter((element) => {
    return (
      !element.hasAttribute('disabled') &&
      element.getAttribute('aria-disabled') !== 'true'
    )
  })
}

const focusFirstElement = () => {
  getFocusableElements()[0]?.focus()
}

const restoreFocus = () => {
  previouslyFocusedElement?.focus()
  previouslyFocusedElement = null
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    emit('close')
    return
  }

  if (event.key !== 'Tab' || !props.open || !compactViewport.value) {
    return
  }

  const focusableElements = getFocusableElements()
  const firstElement = focusableElements[0]
  const lastElement = focusableElements.at(-1)

  if (!firstElement || !lastElement) {
    event.preventDefault()
    return
  }

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault()
    lastElement.focus()
    return
  }

  if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault()
    firstElement.focus()
  }
}

const handleGlobalKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && props.open && compactViewport.value) {
    emit('close')
  }
}

watch(
  () => props.open,
  async (open, wasOpen) => {
    if (!import.meta.client) {
      return
    }

    if (open) {
      previouslyFocusedElement = document.activeElement as HTMLElement | null
      await nextTick()
      focusFirstElement()
      return
    }

    if (wasOpen) {
      await nextTick()
      restoreFocus()
    }
  },
)
</script>
