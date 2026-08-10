import {
  RUNTIME_ERROR_STATUS_CODE,
  RUNTIME_ERROR_STATUS_MESSAGE,
  SERVER_RUNTIME_ERROR_FALLBACK_MESSAGE,
} from '~/types/app'

export default defineNuxtPlugin((nuxtApp) => {
  const previousErrorHandler = nuxtApp.vueApp.config.errorHandler

  nuxtApp.vueApp.config.errorHandler = (error, instance, info) => {
    previousErrorHandler?.(error, instance, info)

    const httpStatusCode =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : undefined

    if (httpStatusCode) {
      return
    }

    throw createError({
      statusCode: RUNTIME_ERROR_STATUS_CODE,
      statusMessage: RUNTIME_ERROR_STATUS_MESSAGE,
      message:
        error instanceof Error
          ? error.message
          : SERVER_RUNTIME_ERROR_FALLBACK_MESSAGE,
      fatal: true,
    })
  }
})
