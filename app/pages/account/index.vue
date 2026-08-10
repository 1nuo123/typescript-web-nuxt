<template>
  <div class="min-h-screen">
    <HomeTopNav />

    <section
      class="mx-auto w-[min(100%,76rem)] px-[clamp(1rem,3vw,1.5rem)] pt-[clamp(2rem,5vw,4rem)] pb-16"
    >
      <PageContainer
        eyebrow="Account"
        title="个人中心"
        description="查看当前登录账号的基础信息、权限上下文和可进入的工作入口。"
      >
        <div class="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
          <article
            class="grid rounded-lg border border-line bg-surface/95 shadow-card"
          >
            <header
              class="flex items-start justify-between gap-4 border-b border-line p-5"
            >
              <div>
                <h2 class="m-0 text-base font-bold leading-snug text-ink">
                  当前用户
                </h2>
                <p
                  class="mt-1 mb-0 text-[0.925rem] leading-relaxed text-ink-muted"
                >
                  会话信息来自当前登录上下文。
                </p>
              </div>
            </header>

            <dl class="m-0 grid grid-cols-2 gap-4 p-5 max-lg:grid-cols-1">
              <div
                v-for="item in accountDetails"
                :key="item.label"
                class="grid gap-2"
              >
                <dt class="text-xs font-extrabold uppercase text-ink-muted">
                  {{ item.label }}
                </dt>
                <dd
                  class="m-0 text-[0.96rem] font-bold leading-relaxed break-words text-ink"
                >
                  {{ item.value }}
                </dd>
              </div>
            </dl>
          </article>

          <article
            class="grid rounded-lg border border-line bg-surface/95 shadow-card"
          >
            <header
              class="flex items-start justify-between gap-4 border-b border-line p-5"
            >
              <div>
                <h2 class="m-0 text-base font-bold leading-snug text-ink">
                  快捷入口
                </h2>
                <p
                  class="mt-1 mb-0 text-[0.925rem] leading-relaxed text-ink-muted"
                >
                  根据当前会话能力提供后续操作入口。
                </p>
              </div>
            </header>

            <div class="flex flex-wrap gap-3 p-5">
              <BaseButton type="button" @click="navigateTo(PUBLIC_HOME_ROUTE)">
                返回首页
              </BaseButton>
              <BaseButton
                v-if="authStore.isAdmin"
                variant="secondary"
                type="button"
                @click="navigateTo(ADMIN_ROUTE_PREFIX)"
              >
                进入后台
              </BaseButton>
            </div>
          </article>
        </div>
      </PageContainer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ADMIN_ROUTE_PREFIX, PUBLIC_HOME_ROUTE } from '~/types/routes'

const ACCOUNT_PAGE_TITLE = '个人中心'

definePageMeta({
  layout: 'public',
  title: ACCOUNT_PAGE_TITLE,
  requiresAuth: true,
})

useSeoMeta({
  title: ACCOUNT_PAGE_TITLE,
  description: '当前登录账号的个人中心与上下文信息。',
})

const authStore = useAuthStore()

const principal = computed(() => authStore.principal)
const accountDetails = computed(() => [
  { label: '用户名', value: principal.value?.username || 'N/A' },
  { label: '主体 ID', value: principal.value?.subject_id || 'N/A' },
  { label: '角色', value: principal.value?.roles.join(', ') || 'No roles' },
  {
    label: '权限范围',
    value: principal.value?.scopes.join(', ') || 'No scopes',
  },
])
</script>
