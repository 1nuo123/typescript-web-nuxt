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
    put: <T>(url: string, body?: ApiRequestBody, options?: ApiRequestOptions) =>
      request<T>(url, { ...options, method: 'PUT', body }),
    delete: <T>(
      url: string,
      body?: ApiRequestBody,
      options?: ApiRequestOptions,
    ) => request<T>(url, { ...options, method: 'DELETE', body }),
  }
}

export const createCodexIdempotencyKey = (): string => {
  const cryptoProvider = globalThis.crypto
  if (typeof cryptoProvider?.randomUUID === 'function') {
    return cryptoProvider.randomUUID()
  }
  if (typeof cryptoProvider?.getRandomValues !== 'function') {
    throw new Error('Web Crypto is required to create an idempotency key')
  }

  const bytes = cryptoProvider.getRandomValues(new Uint8Array(16))
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))

  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}

export const buildCodexIdempotencyHeaders = (
  idempotencyKey: string,
): Record<string, string> => ({
  'Idempotency-Key': idempotencyKey,
})
