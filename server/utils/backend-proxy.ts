export const BACKEND_PROXY_PATH_PREFIX = '/api'
export const BACKEND_BROWSER_AUTH_COOKIE_PATH = '/auth/browser'
export const PUBLIC_BROWSER_AUTH_COOKIE_PATH = `${BACKEND_PROXY_PATH_PREFIX}${BACKEND_BROWSER_AUTH_COOKIE_PATH}`
export const BACKEND_PROXY_COOKIE_PATH_REWRITE = {
  [BACKEND_BROWSER_AUTH_COOKIE_PATH]: PUBLIC_BROWSER_AUTH_COOKIE_PATH,
}

const SUPPORTED_BACKEND_PROTOCOLS = new Set(['http:', 'https:'])

type BackendProxyProtocol = 'http' | 'https'

/**
 * 反向代理转发给后端的公共传输元数据。
 *
 * 该类型只描述经过校验后的协议和端口，避免把任意入站请求头直接
 * 复制到后端，从而保证 Secure Cookie 等安全行为只由可信的 HTTPS
 * 边界驱动。
 */
export type BackendProxyForwarding = Readonly<{
  protocol: BackendProxyProtocol
  port: string
}>

const isLegalForwardedPort = (value: string | undefined): value is string => {
  if (!value || !/^[0-9]{1,5}$/.test(value)) {
    return false
  }

  const port = Number(value)
  return port >= 1 && port <= 65535
}

const resolveRequestProtocol = (requestURL: URL): BackendProxyProtocol =>
  requestURL.protocol === 'https:' ? 'https' : 'http'

const resolveDefaultForwardedPort = (
  requestURL: URL,
  protocol: BackendProxyProtocol,
): string => {
  if (isLegalForwardedPort(requestURL.port)) {
    return requestURL.port
  }

  return protocol === 'https' ? '443' : '80'
}

/**
 * 严格解析入站的公共协议头。
 *
 * 只有值精确等于 `https` 时才接受反向代理的 HTTPS 声明；多值、大小写
 * 变体或其它协议均回退到 Nuxt 看到的内部请求协议。端口同样只接受
 * 十进制 1-65535，非法值在 HTTPS 下回退到标准端口 443。
 */
export const resolveBackendProxyForwarding = (
  requestURL: URL,
  inboundForwardedProto?: string,
  inboundForwardedPort?: string,
): BackendProxyForwarding => {
  const requestProtocol = resolveRequestProtocol(requestURL)

  if (inboundForwardedProto !== 'https') {
    return {
      protocol: requestProtocol,
      port: resolveDefaultForwardedPort(requestURL, requestProtocol),
    }
  }

  return {
    protocol: 'https',
    port: isLegalForwardedPort(inboundForwardedPort)
      ? inboundForwardedPort
      : '443',
  }
}

export const shouldProxyBackendPath = (pathname: string): boolean =>
  pathname === BACKEND_PROXY_PATH_PREFIX ||
  pathname.startsWith(`${BACKEND_PROXY_PATH_PREFIX}/`)

export const stripBackendProxyPrefix = (pathname: string): string => {
  if (!shouldProxyBackendPath(pathname)) {
    throw new Error('Path is outside the Nuxt API proxy namespace.')
  }

  const stripped = pathname.slice(BACKEND_PROXY_PATH_PREFIX.length)
  return stripped || '/'
}

export const buildBackendProxyTarget = (
  apiBaseURL: string,
  pathWithSearch: string,
): string => {
  const trimmedBaseURL = apiBaseURL.trim()

  if (!trimmedBaseURL) {
    throw new Error('Nuxt API proxy target is not configured.')
  }

  const baseURL = new URL(trimmedBaseURL)

  if (!SUPPORTED_BACKEND_PROTOCOLS.has(baseURL.protocol)) {
    throw new Error('Nuxt API proxy target must use HTTP or HTTPS.')
  }

  const normalizedPath = pathWithSearch.startsWith('/')
    ? pathWithSearch
    : `/${pathWithSearch}`
  const target = new URL(normalizedPath, baseURL)

  if (target.origin !== baseURL.origin) {
    throw new Error('Nuxt API proxy target must stay on the configured origin.')
  }

  return target.toString()
}
