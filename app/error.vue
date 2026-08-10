<template>
  <NuxtLayout name="error">
    <EmptyState
      eyebrow="错误"
      :title="displayError.title"
      :description="displayError.description"
    >
      <p
        v-if="diagnosticText"
        class="m-0 font-mono text-[0.8rem] leading-normal break-words text-ink-muted"
      >
        {{ diagnosticText }}
      </p>
      <BaseButton
        v-if="diagnosticText"
        variant="secondary"
        @click="copyDiagnostics"
      >
        复制错误标识
      </BaseButton>
      <BaseButton @click="handleClearError">
        {{ displayError.statusCode >= 500 ? '重试当前页面' : '返回首页' }}
      </BaseButton>
    </EmptyState>
  </NuxtLayout>
</template>

<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{
  error: NuxtError
}>()

const displayError = computed(() => getDisplayError(props.error))
const diagnosticText = computed(() => {
  const ids = [
    displayError.value.requestId
      ? `request_id: ${displayError.value.requestId}`
      : '',
    displayError.value.traceId ? `trace_id: ${displayError.value.traceId}` : '',
  ].filter(Boolean)

  return ids.join(' / ')
})

const handleClearError = () => {
  if (displayError.value.statusCode >= 500) {
    clearError()
    return
  }

  clearError({ redirect: '/' })
}

const copyDiagnostics = async () => {
  if (!import.meta.client || !navigator.clipboard || !diagnosticText.value) {
    return
  }

  await navigator.clipboard.writeText(diagnosticText.value)
}
</script>
