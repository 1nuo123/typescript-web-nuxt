import {
  createError,
  defineEventHandler,
  getHeader,
  getRequestURL,
  proxyRequest,
} from 'h3'
import {
  BACKEND_PROXY_COOKIE_PATH_REWRITE,
  buildBackendProxyTarget,
  resolveBackendProxyForwarding,
  stripBackendProxyPrefix,
  shouldProxyBackendPath,
} from '../utils/backend-proxy'

export default defineEventHandler((event) => {
  // 禁止 H3 直接把内部 HTTP 协议误当成公共协议；公共 HTTPS 只由
  // 严格校验后的 Caddy 入站头部恢复，非法头部则回退到内部请求上下文。
  const requestURL = getRequestURL(event, { xForwardedProto: false })

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

  const forwarding = resolveBackendProxyForwarding(
    requestURL,
    getHeader(event, 'x-forwarded-proto'),
    getHeader(event, 'x-forwarded-port'),
  )

  return proxyRequest(event, target, {
    cookieDomainRewrite: '',
    cookiePathRewrite: BACKEND_PROXY_COOKIE_PATH_REWRITE,
    headers: {
      'x-forwarded-host': requestURL.host,
      'x-forwarded-port': forwarding.port,
      'x-forwarded-proto': forwarding.protocol,
    },
    streamRequest: true,
  })
})
