import {
  RUNTIME_ERROR_FALLBACK_MESSAGE,
  RUNTIME_ERROR_STATUS_CODE,
  RUNTIME_ERROR_STATUS_MESSAGE,
  RuntimeLogSource,
} from '~/types/app'

const BENIGN_RESIZE_OBSERVER_MESSAGES = new Set([
  'ResizeObserver loop completed with undelivered notifications.',
  'ResizeObserver loop limit exceeded',
])

export default defineNuxtPlugin((nuxtApp) => {
  const logger = useClientLogger()
  const previousErrorHandler = nuxtApp.vueApp.config.errorHandler

  const showFatalError = (error: unknown) => {
    showError(
      createError({
        statusCode: RUNTIME_ERROR_STATUS_CODE,
        statusMessage: RUNTIME_ERROR_STATUS_MESSAGE,
        message:
          error instanceof Error
            ? error.message
            : RUNTIME_ERROR_FALLBACK_MESSAGE,
        fatal: true,
      }),
    )
  }

  nuxtApp.vueApp.config.errorHandler = (error, instance, info) => {
    logger.capture(error, {
      source: RuntimeLogSource.Vue,
      detail: info,
    })
    previousErrorHandler?.(error, instance, info)
    showFatalError(error)
  }

  window.addEventListener('error', (event) => {
    if (BENIGN_RESIZE_OBSERVER_MESSAGES.has(event.message)) {
      event.preventDefault()
      return
    }
    logger.capture(event.error ?? event.message, {
      source: RuntimeLogSource.Window,
      detail: event.filename,
    })
    showFatalError(event.error ?? event.message)
  })

  window.addEventListener('unhandledrejection', (event) => {
    logger.capture(event.reason, {
      source: RuntimeLogSource.Promise,
    })
    showFatalError(event.reason)
  })
})
