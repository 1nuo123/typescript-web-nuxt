import type {
  ApiRequestBody,
  ApiRequestOptions,
  ApiResponseEnvelope,
} from '~/types/api'
import { unwrapResponseEnvelope } from './envelope'

export const createCodexApiClient = () => {
  const api = useAuthenticatedApi()

  const request = async <T>(
    url: string,
    options: ApiRequestOptions = {},
  ): Promise<T> => {
    const envelope = await api.request<ApiResponseEnvelope<T>>(url, options)
    return unwrapResponseEnvelope(envelope)
  }

  return {
    get: <T>(url: string, options?: ApiRequestOptions) =>
      request<T>(url, { ...options, method: 'GET' }),
    post: <T>(
      url: string,
      body?: ApiRequestBody,
      options?: ApiRequestOptions,
    ) => request<T>(url, { ...options, method: 'POST', body }),
    patch: <T>(
      url: string,
      body?: ApiRequestBody,
      options?: ApiRequestOptions,
    ) => request<T>(url, { ...options, method: 'PATCH', body }),
  }
}

export const createCodexIdempotencyKey = (): string => {
  if (import.meta.client && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const buildCodexIdempotencyHeaders = (
  idempotencyKey: string,
): Record<string, string> => ({
  'Idempotency-Key': idempotencyKey,
})
