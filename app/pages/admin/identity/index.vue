<template>
  <PageContainer
    eyebrow="业务后台"
    title="身份管理"
    description="身份管理页面仅承载管理员用户、角色与 scope。"
  >
    <section
      class="grid grid-cols-1 gap-4 lg:grid-cols-12"
      aria-label="身份管理模块"
    >
      <NuxtLink
        v-for="item in ADMIN_IDENTITY_ROUTE_ENTRIES"
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
import { LOGIN_ROUTE } from '~/types/routes'
import { ADMIN_IDENTITY_ROUTE_ENTRIES } from '~/utils/admin-routes'

const IDENTITY_PAGE_TITLE = '身份管理'

definePageMeta({
  title: IDENTITY_PAGE_TITLE,
  requiresAuth: true,
  redirectTo: LOGIN_ROUTE,
  requiredRoles: [AuthRole.Admin],
  requiredScopes: [AuthScope.AuthRead],
  adminBoundaryPolicy: AdminBoundaryPolicy.BusinessAdmin,
})
</script>
