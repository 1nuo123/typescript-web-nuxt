<template>
  <PageContainer
    eyebrow="后台"
    title="后台总览"
    description="业务后台与运维控制面分开承载，页面入口按当前主体权限裁剪。"
  >
    <section
      class="grid grid-cols-1 gap-4 lg:grid-cols-12"
      aria-label="后台模块"
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
import { AuthRole } from '~/types/auth'
import { RuntimeFeatureFlag } from '~/types/app'
import { LOGIN_ROUTE } from '~/types/routes'
import { ADMIN_HUB_ROUTE_ENTRIES } from '~/utils/admin-routes'

const ADMIN_OVERVIEW_TITLE = '后台总览'

definePageMeta({
  title: ADMIN_OVERVIEW_TITLE,
  requiresAuth: true,
  redirectTo: LOGIN_ROUTE,
  requiredRoles: [AuthRole.Admin],
})

const authStore = useAuthStore()
const runtimeConfig = useRuntimeConfig()
const runtimeFeatures = computed<Record<RuntimeFeatureFlag, boolean>>(() => ({
  [RuntimeFeatureFlag.AdminOps]: Boolean(runtimeConfig.public.adminOpsEnabled),
  [RuntimeFeatureFlag.Codex]: Boolean(runtimeConfig.public.codexFeatureEnabled),
}))

const visibleModules = computed(() => {
  return ADMIN_HUB_ROUTE_ENTRIES.filter((item) => {
    const runtimeEnabled =
      !item.requiredRuntimeFlag ||
      runtimeFeatures.value[item.requiredRuntimeFlag]

    return runtimeEnabled && authStore.can(item)
  })
})
</script>
