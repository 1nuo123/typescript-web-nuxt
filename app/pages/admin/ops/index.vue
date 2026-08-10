<template>
  <PageContainer
    eyebrow="运维"
    title="运维控制面"
    description="运维能力与业务后台隔离，入口按系统、任务与安全 scope 裁剪。"
  >
    <section
      class="grid grid-cols-1 gap-4 lg:grid-cols-12"
      aria-label="运维模块"
    >
      <NuxtLink
        v-for="item in visibleModules"
        :key="item.to"
        class="grid min-w-0 gap-3 rounded-lg border border-line bg-surface p-5 no-underline shadow-card transition hover:-translate-y-px hover:border-line-strong hover:shadow-pop lg:col-span-4"
        :to="item.to"
      >
        <h2 class="m-0 text-base font-extrabold leading-snug text-ink">
          {{ item.title }}
        </h2>
        <p class="m-0 text-sm leading-relaxed text-ink-muted">
          {{ item.description }}
        </p>
      </NuxtLink>
    </section>
  </PageContainer>
</template>

<script setup lang="ts">
import { AdminBoundaryPolicy, AuthRole, AuthScope } from '~/types/auth'
import { RuntimeFeatureFlag } from '~/types/app'
import { LOGIN_ROUTE } from '~/types/routes'
import { ADMIN_OPS_ROUTE_ENTRIES } from '~/utils/admin-routes'

const OPS_PAGE_TITLE = '运维控制面'

definePageMeta({
  title: OPS_PAGE_TITLE,
  requiresAuth: true,
  redirectTo: LOGIN_ROUTE,
  requiredRoles: [AuthRole.Admin],
  requiredScopes: [AuthScope.SystemRead],
  adminBoundaryPolicy: AdminBoundaryPolicy.OpsOnly,
  requiredRuntimeFlag: RuntimeFeatureFlag.AdminOps,
})

const authStore = useAuthStore()

const visibleModules = computed(() =>
  ADMIN_OPS_ROUTE_ENTRIES.filter((item) => authStore.can(item)),
)
</script>
