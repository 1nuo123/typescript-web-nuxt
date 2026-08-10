import {
  createError,
  defineEventHandler,
  getRequestURL,
  proxyRequest,
} from 'h3'
import {
  BACKEND_PROXY_COOKIE_PATH_REWRITE,
  buildBackendProxyTarget,
  stripBackendProxyPrefix,
  shouldProxyBackendPath,
} from '../utils/backend-proxy'

const DEFAULT_HTTP_PORT = '80'
const DEFAULT_HTTPS_PORT = '443'

const resolveForwardedPort = (requestURL: URL): string => {
  if (requestURL.port) {
    return requestURL.port
  }

  return requestURL.protocol === 'https:'
    ? DEFAULT_HTTPS_PORT
    : DEFAULT_HTTP_PORT
}

export default defineEventHandler((event) => {
  const requestURL = getRequestURL(event)

  if (!shouldProxyBackendPath(requestURL.pathname)) {
    return
  }

  const runtimeConfig = useRuntimeConfig(event)
  const apiBaseURL = String(runtimeConfig.apiBaseURL || '')
  let target: string

  try {
    target = buildBackendProxyTarget(
      apiBaseURL,
      `${stripBackendProxyPrefix(requestURL.pathname)}${requestURL.search}`,
    )
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage:
        error instanceof Error
          ? error.message
          : 'Nuxt API proxy target is invalid.',
    })
  }

  return proxyRequest(event, target, {
    cookieDomainRewrite: '',
    cookiePathRewrite: BACKEND_PROXY_COOKIE_PATH_REWRITE,
    headers: {
      'x-forwarded-host': requestURL.host,
      'x-forwarded-port': resolveForwardedPort(requestURL),
      'x-forwarded-proto': requestURL.protocol.slice(0, -1),
    },
    streamRequest: true,
  })
})
