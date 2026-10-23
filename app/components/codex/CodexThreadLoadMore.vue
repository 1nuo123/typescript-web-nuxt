<template>
  <div v-if="session.threadNextCursor || error" class="grid gap-2 p-2">
    <p v-if="error" role="alert" class="m-0 text-xs text-danger">{{ error }}</p>
    <BaseButton
      v-if="session.threadNextCursor"
      size="sm"
      variant="secondary"
      :loading="loading"
      @click="load"
    >
      加载更多会话
    </BaseButton>
  </div>
</template>

<script setup lang="ts">
const session = useCodexSessionStore()
const loading = ref(false)
const error = ref('')
const load = async () => {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    await session.loadMoreThreads()
  } catch {
    error.value = '加载失败，已显示的会话保留，请重试。'
  } finally {
    loading.value = false
  }
}
</script>
