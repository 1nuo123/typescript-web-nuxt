<template>
  <div ref="menuRoot" class="relative">
    <button
      class="home-user-menu__trigger inline-flex min-h-11 min-w-0 items-center gap-3 rounded-lg border border-line bg-surface px-3 text-ink transition hover:-translate-y-px hover:border-line-strong hover:bg-surface-muted hover:shadow-card max-md:min-h-10 max-md:gap-2 max-md:px-2"
      type="button"
      :aria-expanded="open"
      aria-haspopup="menu"
      title="当前用户"
      @click="toggleMenu"
    >
      <span
        class="inline-flex size-8 flex-none items-center justify-center rounded-full bg-primary/15 text-xs font-extrabold text-primary"
        aria-hidden="true"
      >
        {{ userInitials }}
      </span>
      <span class="grid min-w-0 text-left">
        <span
          class="overflow-hidden text-ellipsis whitespace-nowrap text-[0.7rem] font-bold text-ink-muted max-md:hidden"
        >
          当前用户
        </span>
        <span
          class="overflow-hidden text-ellipsis whitespace-nowrap text-[0.9rem] font-extrabold text-ink max-md:max-w-30"
        >
          {{ username }}
        </span>
      </span>
      <ChevronDown
        class="size-4 flex-none text-ink-muted transition-transform duration-200"
        :class="{ 'rotate-180': open }"
        aria-hidden="true"
      />
    </button>

    <Transition
      enter-active-class="transition-[opacity,transform] duration-200"
      leave-active-class="transition-[opacity,transform] duration-200"
      enter-from-class="opacity-0 -translate-y-1.5 scale-[0.98]"
      leave-to-class="opacity-0 -translate-y-1.5 scale-[0.98]"
    >
      <div
        v-if="open"
        class="absolute top-[calc(100%+0.75rem)] right-0 z-50 grid w-[min(16rem,calc(100vw-2rem))] gap-1 rounded-lg border border-line bg-elevated/95 p-2 shadow-pop backdrop-blur-xl"
        role="menu"
      >
        <button
          class="inline-flex min-h-[2.625rem] w-full items-center gap-3 rounded-md border-0 bg-transparent px-3 font-bold text-ink enabled:hover:bg-surface-muted"
          type="button"
          role="menuitem"
          title="个人中心"
          @click="emitAccount"
        >
          <CircleUserRound class="size-4 flex-none" aria-hidden="true" />
          <span>个人中心</span>
        </button>
        <button
          class="inline-flex min-h-[2.625rem] w-full items-center gap-3 rounded-md border-0 bg-transparent px-3 font-bold text-danger enabled:hover:bg-danger-soft/80"
          type="button"
          role="menuitem"
          :disabled="logoutPending"
          title="退出登录"
          @click="emitLogout"
        >
          <LogOut class="size-4 flex-none" aria-hidden="true" />
          <span>{{ logoutPending ? '退出中...' : '退出登录' }}</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ChevronDown, CircleUserRound, LogOut } from '@lucide/vue'

const props = withDefaults(
  defineProps<{
    username: string
    logoutPending?: boolean
  }>(),
  {
    logoutPending: false,
  },
)

const emit = defineEmits<{
  account: []
  logout: []
}>()

const open = ref(false)
const menuRoot = ref<HTMLElement | null>(null)

const userInitials = computed(() => {
  const trimmedUsername = props.username.trim()

  if (!trimmedUsername) {
    return 'ME'
  }

  return trimmedUsername.slice(0, 2).toUpperCase()
})

const closeMenu = () => {
  open.value = false
}

const toggleMenu = () => {
  open.value = !open.value
}

const emitAccount = () => {
  closeMenu()
  emit('account')
}

const emitLogout = () => {
  closeMenu()
  emit('logout')
}

const handlePointerDown = (event: PointerEvent) => {
  if (menuRoot.value?.contains(event.target as Node)) {
    return
  }

  closeMenu()
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    closeMenu()
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handlePointerDown)
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handlePointerDown)
  window.removeEventListener('keydown', handleKeydown)
})
</script>
