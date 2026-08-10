<template>
  <div class="min-h-screen">
    <HomeTopNav />

    <main class="px-4 pt-10 pb-16 sm:px-6 lg:pt-14">
      <div class="mx-auto grid w-full max-w-6xl gap-10">
        <section
          class="grid min-w-0 grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)] lg:gap-12"
        >
          <div class="grid min-w-0 gap-5 pt-2 lg:pt-8">
            <p class="m-0 text-xs font-bold uppercase text-primary">
              Workspace
            </p>
            <div class="grid gap-3">
              <h1
                class="m-0 text-[2.25rem] font-bold leading-[1.1] text-ink sm:text-[2.75rem]"
              >
                首页工作台
              </h1>
              <p class="m-0 max-w-2xl text-[0.98rem] leading-7 text-ink-muted">
                集中查看当前会话状态，并进入与你权限匹配的工作区。
              </p>
            </div>
            <div class="flex flex-wrap gap-2.5 max-sm:grid max-sm:grid-cols-1">
              <BaseButton type="button" @click="handlePrimaryAction">
                <component
                  :is="authStore.isAuthenticated ? UserRound : LogIn"
                  class="size-4"
                  aria-hidden="true"
                />
                {{ primaryActionLabel }}
              </BaseButton>
              <BaseButton
                v-if="authStore.isAuthenticated && authStore.isAdmin"
                variant="secondary"
                type="button"
                @click="navigateTo(ADMIN_ROUTE_PREFIX)"
              >
                <ShieldCheck class="size-4" aria-hidden="true" />
                进入后台
              </BaseButton>
            </div>
          </div>

          <section
            id="session-overview"
            class="overflow-hidden rounded-lg border border-line bg-surface shadow-card"
            aria-labelledby="session-overview-title"
          >
            <header
              class="flex items-start justify-between gap-4 border-b border-line bg-surface-muted/55 px-5 py-4"
            >
              <div class="min-w-0">
                <p class="m-0 text-xs font-semibold text-primary">当前会话</p>
                <h2
                  id="session-overview-title"
                  class="mt-1 mb-0 text-lg font-bold text-ink"
                >
                  {{ sessionHeading }}
                </h2>
              </div>
              <BaseBadge
                :tone="authStore.isAuthenticated ? 'success' : 'neutral'"
              >
                {{ sessionStatusLabel }}
              </BaseBadge>
            </header>

            <dl class="m-0 divide-y divide-line px-5">
              <div
                v-for="metric in sessionMetrics"
                :key="metric.label"
                class="grid grid-cols-[minmax(7rem,0.7fr)_minmax(0,1fr)] items-center gap-4 py-3.5 text-sm"
              >
                <dt class="text-ink-muted">{{ metric.label }}</dt>
                <dd class="m-0 truncate text-right font-semibold text-ink">
                  {{ metric.value }}
                </dd>
              </div>
            </dl>
          </section>
        </section>

        <section
          class="grid gap-4 border-t border-line pt-7"
          aria-labelledby="quick-actions-title"
        >
          <div class="flex items-end justify-between gap-4">
            <div>
              <p class="m-0 text-xs font-bold uppercase text-primary">
                Shortcuts
              </p>
              <h2
                id="quick-actions-title"
                class="mt-1.5 mb-0 text-xl font-bold text-ink"
              >
                快捷入口
              </h2>
            </div>
            <span class="text-xs text-ink-muted">
              {{ quickActions.length }} 个可用入口
            </span>
          </div>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <NuxtLink
              v-for="action in quickActions"
              :key="action.to"
              :to="action.to"
              class="group flex min-h-24 min-w-0 items-center gap-4 rounded-lg border border-line bg-surface p-4 no-underline shadow-card transition-[border-color,box-shadow,background-color] hover:border-line-strong hover:bg-elevated hover:shadow-pop"
            >
              <span
                class="grid size-10 shrink-0 place-items-center rounded-md bg-primary-soft text-primary"
                aria-hidden="true"
              >
                <component :is="action.icon" class="size-[1.125rem]" />
              </span>
              <span class="min-w-0 flex-1">
                <strong class="block text-[0.9rem] font-semibold text-ink">
                  {{ action.title }}
                </strong>
                <span class="mt-1 block text-xs leading-5 text-ink-muted">
                  {{ action.description }}
                </span>
              </span>
              <ArrowUpRight
                class="size-4 shrink-0 text-ink-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
                aria-hidden="true"
              />
            </NuxtLink>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import {
  ArrowUpRight,
  LogIn,
  ShieldCheck,
  UserPlus,
  UserRound,
} from '@lucide/vue'
import { AuthSessionStatus } from '~/types/auth'
import {
  ACCOUNT_ROUTE,
  ADMIN_ROUTE_PREFIX,
  LOGIN_ROUTE,
  REGISTER_ROUTE,
} from '~/types/routes'

const HOME_PAGE_TITLE = '首页'

definePageMeta({
  layout: 'public',
  title: HOME_PAGE_TITLE,
})

useSeoMeta({
  title: HOME_PAGE_TITLE,
})

const authStore = useAuthStore()

const primaryActionLabel = computed(() => {
  return authStore.isAuthenticated ? '进入个人中心' : '登录账号'
})
const sessionStatusLabel = computed(() => {
  return authStore.isAuthenticated ? '已登录' : '访客模式'
})
const sessionHeading = computed(() => {
  return authStore.isAuthenticated
    ? `你好，${authStore.principal?.username || '用户'}`
    : '登录后解锁完整工作区'
})
const sessionMetrics = computed(() => {
  const principal = authStore.principal

  return [
    {
      label: '当前用户',
      value: principal?.username || 'Guest',
    },
    {
      label: '角色',
      value: principal?.roles.join(' / ') || '暂无',
    },
    {
      label: '权限范围',
      value: principal?.scopes.length
        ? `${principal.scopes.length} 项`
        : '暂无',
    },
    {
      label: '鉴权状态',
      value:
        authStore.status === AuthSessionStatus.Authenticated
          ? 'Ready'
          : 'Waiting',
    },
  ]
})
const quickActions = computed(() => {
  if (!authStore.isAuthenticated) {
    return [
      {
        title: '登录账号',
        description: '继续进入你的工作区',
        to: LOGIN_ROUTE,
        icon: LogIn,
      },
      {
        title: '创建账号',
        description: '注册新的工作区账号',
        to: REGISTER_ROUTE,
        icon: UserPlus,
      },
    ]
  }

  return [
    {
      title: '个人中心',
      description: '查看账号与权限信息',
      to: ACCOUNT_ROUTE,
      icon: UserRound,
    },
    ...(authStore.isAdmin
      ? [
          {
            title: '后台管理',
            description: '管理身份、审计与系统状态',
            to: ADMIN_ROUTE_PREFIX,
            icon: ShieldCheck,
          },
        ]
      : []),
  ]
})

const handlePrimaryAction = async () => {
  await navigateTo(authStore.isAuthenticated ? ACCOUNT_ROUTE : LOGIN_ROUTE)
}
</script>
