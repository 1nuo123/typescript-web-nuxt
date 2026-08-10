<template>
  <header
    class="sticky top-0 z-30 grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-line bg-elevated/92 px-5 backdrop-blur-xl max-lg:grid-cols-[minmax(0,1fr)_auto] max-lg:px-4"
  >
    <div class="flex min-w-0 items-center gap-3">
      <BaseButton
        class="app-header__menu hidden max-lg:inline-flex"
        icon
        variant="secondary"
        size="md"
        type="button"
        :aria-label="
          navigationOpen ? NAVIGATION_CLOSE_LABEL : NAVIGATION_OPEN_LABEL
        "
        :aria-expanded="navigationOpen"
        aria-controls="app-sidebar"
        :title="navigationOpen ? NAVIGATION_CLOSE_LABEL : NAVIGATION_OPEN_LABEL"
        @click="$emit('toggleNavigation')"
      >
        <X v-if="navigationOpen" class="size-[1.05rem]" aria-hidden="true" />
        <Menu v-else class="size-[1.05rem]" aria-hidden="true" />
      </BaseButton>
      <NuxtLink
        class="flex min-w-0 items-center gap-2.5 font-bold no-underline"
        to="/"
      >
        <span
          class="grid aspect-square w-8 place-items-center rounded-md bg-primary text-canvas shadow-[0_4px_12px_color-mix(in_srgb,var(--ui-primary)_22%,transparent)]"
          aria-hidden="true"
        >
          <PanelsTopLeft class="size-4" />
        </span>
        <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {{ title }}
        </span>
      </NuxtLink>
    </div>

    <nav
      v-if="items.length"
      class="flex min-w-0 items-center justify-center gap-1 max-lg:hidden"
      :aria-label="MAIN_NAVIGATION_LABEL"
    >
      <NuxtLink
        v-for="item in items"
        :key="item.to"
        class="min-h-9 rounded-md px-3 text-[0.85rem] font-semibold leading-9 no-underline transition-colors hover:bg-surface-muted hover:text-ink"
        :class="
          isActive(item)
            ? 'bg-primary-soft text-primary-strong'
            : 'text-ink-muted'
        "
        :to="item.to"
        :aria-disabled="item.disabled || undefined"
        @click="item.disabled && $event.preventDefault()"
      >
        {{ item.label }}
      </NuxtLink>
    </nav>

    <div class="flex min-w-0 items-center justify-end gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
import { Menu, PanelsTopLeft, X } from '@lucide/vue'
import { DEFAULT_APP_NAME, type AppNavItem } from '~/types/app'

const NAVIGATION_CLOSE_LABEL = '关闭导航'
const NAVIGATION_OPEN_LABEL = '打开导航'
const MAIN_NAVIGATION_LABEL = '主导航'

withDefaults(
  defineProps<{
    title?: string
    items?: AppNavItem[]
    navigationOpen?: boolean
  }>(),
  {
    title: DEFAULT_APP_NAME,
    items: () => [],
    navigationOpen: false,
  },
)

defineEmits<{
  toggleNavigation: []
}>()

const route = useRoute()

const isActive = (item: AppNavItem) => {
  if (item.exact) {
    return route.fullPath === item.to
  }

  if (item.to.includes('#')) {
    return route.fullPath === item.to
  }

  return route.path === item.to || route.path.startsWith(`${item.to}/`)
}
</script>
