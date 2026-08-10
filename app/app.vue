<template>
  <NuxtRouteAnnouncer />
  <NuxtErrorBoundary>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>

    <template #error="{ error, clearError }">
      <NuxtLayout name="error">
        <EmptyState
          :eyebrow="RUNTIME_BOUNDARY_EYEBROW"
          :title="runtimeBoundary.display(error).title"
          :description="runtimeBoundary.display(error).description"
        >
          <p
            v-if="runtimeBoundary.diagnosticText(error)"
            class="m-0 font-mono text-[0.8rem] leading-normal break-words text-ink-muted"
          >
            {{ runtimeBoundary.diagnosticText(error) }}
          </p>
          <BaseButton
            v-if="runtimeBoundary.diagnosticText(error)"
            variant="secondary"
            @click="runtimeBoundary.copyDiagnostics(error)"
          >
            {{ COPY_DIAGNOSTICS_BUTTON_LABEL }}
          </BaseButton>
          <BaseButton @click="runtimeBoundary.clear(error, clearError)">
            {{
              runtimeBoundary.display(error).statusCode >= 500
                ? RETRY_VIEW_BUTTON_LABEL
                : RESET_VIEW_BUTTON_LABEL
            }}
          </BaseButton>
        </EmptyState>
      </NuxtLayout>
    </template>
  </NuxtErrorBoundary>
</template>

<script setup lang="ts">
const runtimeConfig = useRuntimeConfig()
const { initializeTheme } = useTheme()

const RUNTIME_BOUNDARY_EYEBROW = '运行时'
const COPY_DIAGNOSTICS_BUTTON_LABEL = '复制错误标识'
const RETRY_VIEW_BUTTON_LABEL = '重试视图'
const RESET_VIEW_BUTTON_LABEL = '重置视图'
const REQUEST_DIAGNOSTIC_LABEL = 'request_id'
const TRACE_DIAGNOSTIC_LABEL = 'trace_id'

initializeTheme()

useHead({
  titleTemplate: (title) => {
    const appName = runtimeConfig.public.appName
    return title ? `${title} | ${appName}` : appName
  },
})

const runtimeBoundary = {
  display(error: unknown) {
    return getDisplayError(error)
  },
  diagnosticText(error: unknown) {
    const displayError = getDisplayError(error)
    const ids = [
      displayError.requestId
        ? `${REQUEST_DIAGNOSTIC_LABEL}: ${displayError.requestId}`
        : '',
      displayError.traceId
        ? `${TRACE_DIAGNOSTIC_LABEL}: ${displayError.traceId}`
        : '',
    ].filter(Boolean)

    return ids.join(' / ')
  },
  async copyDiagnostics(error: unknown) {
    const diagnosticText = runtimeBoundary.diagnosticText(error)

    if (!import.meta.client || !navigator.clipboard || !diagnosticText) {
      return
    }

    await navigator.clipboard.writeText(diagnosticText)
  },
  clear(error: unknown, clearError: () => void) {
    const displayError = getDisplayError(error)

    clearError()

    if (displayError.statusCode >= 500 && import.meta.client) {
      window.location.reload()
    }
  },
}
</script>
