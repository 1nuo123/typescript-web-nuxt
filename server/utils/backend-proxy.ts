export const BACKEND_PROXY_PATH_PREFIX = '/api'
export const BACKEND_BROWSER_AUTH_COOKIE_PATH = '/auth/browser'
export const PUBLIC_BROWSER_AUTH_COOKIE_PATH = `${BACKEND_PROXY_PATH_PREFIX}${BACKEND_BROWSER_AUTH_COOKIE_PATH}`
export const BACKEND_PROXY_COOKIE_PATH_REWRITE = {
  [BACKEND_BROWSER_AUTH_COOKIE_PATH]: PUBLIC_BROWSER_AUTH_COOKIE_PATH,
}

const SUPPORTED_BACKEND_PROTOCOLS = new Set(['http:', 'https:'])

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
