<template><span class="sr-only">正在打开 Codex 会话</span></template>

<script setup lang="ts">
import { AuthScope } from '~/types/auth'
import { RuntimeFeatureFlag } from '~/types/app'
import { CODEX_TASKS_ROUTE, LOGIN_ROUTE } from '~/types/routes'

definePageMeta({
  layout: 'codex',
  requiresAuth: true,
  redirectTo: LOGIN_ROUTE,
  requiredScopes: [AuthScope.CodexRead],
  requiredRuntimeFlag: RuntimeFeatureFlag.Codex,
  title: 'Codex',
})

await navigateTo(CODEX_TASKS_ROUTE)
</script>
