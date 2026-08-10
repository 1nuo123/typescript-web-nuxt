import type {
  ApiClientOptions,
  ApiErrorPayload,
  ApiRequestBody,
  ApiRequestOptions,
} from '~/types/api'
import { getActivePinia } from 'pinia'

const withSkipRefresh = (
  options: ApiRequestOptions = {},
): ApiRequestOptions => {
  return {
    ...options,
    meta: {
      ...options.meta,
      skipRefresh: true,
    },
  }
}

export const useAuthenticatedApi = (clientOptions: ApiClientOptions = {}) => {
  const pinia = getActivePinia()

  if (!pinia) {
    throw new Error(
      'Authenticated API client requires an active Pinia instance.',
    )
  }

  const authStore = useAuthStore(pinia)
  const api = useApi({
    ...clientOptions,
    getToken: async () =>
      (await clientOptions.getToken?.()) ?? authStore.accessToken,
    onError: async (error) => {
      authStore.consumeApiError(error)
      await clientOptions.onError?.(error)
    },
  })

  const request = async <T>(
    url: string,
    options: ApiRequestOptions = {},
  ): Promise<T> => {
    try {
      return await api.request<T>(url, options)
    } catch (error) {
      const normalized = error as ApiErrorPayload

      if (
        options.meta?.skipAuth === true ||
        options.meta?.skipRefresh === true ||
        !authStore.shouldRefreshForError(normalized)
      ) {
        throw normalized
      }

      const refreshed = await authStore.refresh()

      if (!refreshed || !authStore.accessToken) {
        throw normalized
      }

      return api.request<T>(url, withSkipRefresh(options))
    }
  }

  return {
    request,
    get: <T>(url: string, options?: ApiRequestOptions) =>
      request<T>(url, { ...options, method: 'GET' }),
    post: <T>(
      url: string,
      body?: ApiRequestBody,
      options?: ApiRequestOptions,
    ) => request<T>(url, { ...options, method: 'POST', body }),
    put: <T>(url: string, body?: ApiRequestBody, options?: ApiRequestOptions) =>
      request<T>(url, { ...options, method: 'PUT', body }),
    patch: <T>(
      url: string,
      body?: ApiRequestBody,
      options?: ApiRequestOptions,
    ) => request<T>(url, { ...options, method: 'PATCH', body }),
    delete: <T>(url: string, options?: ApiRequestOptions) =>
      request<T>(url, { ...options, method: 'DELETE' }),
  }
}
