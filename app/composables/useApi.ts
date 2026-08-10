import type {
  ApiRequestBody,
  ApiClientOptions,
  ApiErrorPayload,
  ApiRequestResolutionInput,
  ApiRequestOptions,
  ResolvedApiRequest,
} from '~/types/api'
import {
  API_AUTHORIZATION_HEADER_NAME,
  API_EXTERNAL_REQUEST_ERROR_MESSAGE,
  API_EXTERNAL_REQUEST_ERROR_STATUS_CODE,
  API_EXTERNAL_REQUEST_ERROR_STATUS_MESSAGE,
  API_URL_PARSE_BASE,
  ApiClientErrorCode,
  ApiAuthStrategy,
  DEFAULT_API_TIMEOUT_MS,
  parseRuntimeApiTimeout,
} from '~/types/api'
import { AUTH_BEARER_TOKEN_TYPE, AUTH_PUBLIC_API_ENDPOINTS } from '~/types/auth'
import { normalizeApiError } from '~/utils/errors'

export const resolveApiRequest = ({
  url,
  baseURL,
  meta,
  publicPaths,
}: ApiRequestResolutionInput): ResolvedApiRequest => {
  const fallbackBaseURL = new URL(API_URL_PARSE_BASE)
  const configuredBaseURL = baseURL
    ? new URL(baseURL, fallbackBaseURL)
    : fallbackBaseURL
  const parsedWithFallback = new URL(url, fallbackBaseURL)
  const requestURL = new URL(url, configuredBaseURL)
  const requestPath = requestURL.pathname
  const isAbsoluteRequest = parsedWithFallback.origin !== fallbackBaseURL.origin
  const isConfiguredOrigin = requestURL.origin === configuredBaseURL.origin
  const shouldSkipAuth =
    meta?.authStrategy === ApiAuthStrategy.Public ||
    meta?.skipAuth === true ||
    publicPaths.includes(requestPath)

  return {
    requestPath,
    isAbsoluteRequest,
    isConfiguredOrigin,
    shouldSkipAuth,
  }
}

export const useApi = (clientOptions: ApiClientOptions = {}) => {
  const runtimeConfig = useRuntimeConfig()

  const request = async <T>(
    url: string,
    requestOptions: ApiRequestOptions = {},
  ): Promise<T> => {
    const { meta, headers, ...fetchOptions } = requestOptions
    const configuredBaseURL = import.meta.server
      ? runtimeConfig.apiBaseURL || runtimeConfig.public.apiBaseURL
      : runtimeConfig.public.apiBaseURL
    const baseURL = clientOptions.baseURL || String(configuredBaseURL || '')
    const timeout =
      clientOptions.timeout ??
      parseRuntimeApiTimeout(
        runtimeConfig.public.apiTimeout || DEFAULT_API_TIMEOUT_MS,
      )

    try {
      const publicPaths = clientOptions.publicPaths ?? AUTH_PUBLIC_API_ENDPOINTS
      const resolvedRequest = resolveApiRequest({
        url,
        baseURL,
        meta,
        publicPaths,
      })

      if (
        !resolvedRequest.shouldSkipAuth &&
        resolvedRequest.isAbsoluteRequest &&
        !resolvedRequest.isConfiguredOrigin
      ) {
        throw {
          statusCode: API_EXTERNAL_REQUEST_ERROR_STATUS_CODE,
          statusMessage: API_EXTERNAL_REQUEST_ERROR_STATUS_MESSAGE,
          message: API_EXTERNAL_REQUEST_ERROR_MESSAGE,
          code: ApiClientErrorCode.ExternalProtectedRequest,
          errorCode: ApiClientErrorCode.ExternalProtectedRequest,
        } satisfies ApiErrorPayload
      }

      const token = resolvedRequest.shouldSkipAuth
        ? null
        : await clientOptions.getToken?.()
      const mergedHeaders = new Headers(headers)

      if (token && !mergedHeaders.has(API_AUTHORIZATION_HEADER_NAME)) {
        mergedHeaders.set(
          API_AUTHORIZATION_HEADER_NAME,
          `${AUTH_BEARER_TOKEN_TYPE} ${token}`,
        )
      }

      return await $fetch<T>(url, {
        baseURL,
        timeout,
        ...fetchOptions,
        headers: mergedHeaders,
      })
    } catch (error) {
      const normalized = normalizeApiError(error)

      try {
        await clientOptions.onError?.(normalized)
      } catch {
        // 错误回调只做副作用，不能覆盖原始请求失败。
      }

      throw normalized
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

export type { ApiErrorPayload }
