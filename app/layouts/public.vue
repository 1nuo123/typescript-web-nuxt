<template>
  <div class="min-h-screen">
    <slot />
  </div>
</template>

<script setup lang="ts">
const authStore = useAuthStore()

await authStore.initSession()
</script>
