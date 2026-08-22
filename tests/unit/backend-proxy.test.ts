import { describe, expect, it } from 'vitest'
import {
  BACKEND_PROXY_COOKIE_PATH_REWRITE,
  PUBLIC_BROWSER_AUTH_COOKIE_PATH,
  buildBackendProxyTarget,
  resolveBackendProxyForwarding,
  stripBackendProxyPrefix,
  shouldProxyBackendPath,
} from '../../server/utils/backend-proxy'

describe('backend proxy routing', () => {
  it('only proxies backend API surfaces', () => {
    expect(shouldProxyBackendPath('/api/auth/browser/refresh')).toBe(true)
    expect(shouldProxyBackendPath('/api/codex/events')).toBe(true)
    expect(shouldProxyBackendPath('/api/admin/users')).toBe(true)
    expect(shouldProxyBackendPath('/admin')).toBe(false)
    expect(shouldProxyBackendPath('/codex/tasks')).toBe(false)
    expect(shouldProxyBackendPath('/login')).toBe(false)
  })

  it('strips only the Nuxt API proxy namespace', () => {
    expect(stripBackendProxyPrefix('/api/auth/browser/refresh')).toBe(
      '/auth/browser/refresh',
    )
    expect(stripBackendProxyPrefix('/api')).toBe('/')
    expect(() => stripBackendProxyPrefix('/auth/browser/refresh')).toThrow(
      'outside',
    )
  })

  it('rewrites browser refresh cookie path into the public proxy namespace', () => {
    expect(PUBLIC_BROWSER_AUTH_COOKIE_PATH).toBe('/api/auth/browser')
    expect(BACKEND_PROXY_COOKIE_PATH_REWRITE).toEqual({
      '/auth/browser': '/api/auth/browser',
    })
  })

  it('builds targets on the configured backend origin', () => {
    expect(
      buildBackendProxyTarget(
        'http://host.docker.internal:8000',
        '/auth/browser/refresh?next=1',
      ),
    ).toBe('http://host.docker.internal:8000/auth/browser/refresh?next=1')
  })

  it('rejects missing or non-http backend origins', () => {
    expect(() => buildBackendProxyTarget('', '/auth/me')).toThrow(
      'not configured',
    )
    expect(() =>
      buildBackendProxyTarget('file:///tmp/api', '/auth/me'),
    ).toThrow('HTTP or HTTPS')
  })

  it('preserves an exact HTTPS forwarding declaration from the public proxy', () => {
    expect(
      resolveBackendProxyForwarding(
        new URL('http://frontend:3000/api/auth/browser/token'),
        'https',
        '443',
      ),
    ).toEqual({ protocol: 'https', port: '443' })
  })

  it('accepts only legal decimal forwarding ports', () => {
    expect(
      resolveBackendProxyForwarding(
        new URL('http://frontend:3000/api/auth/browser/token'),
        'https',
        '8443',
      ),
    ).toEqual({ protocol: 'https', port: '8443' })
    expect(
      resolveBackendProxyForwarding(
        new URL('http://frontend:3000/api/auth/browser/token'),
        'https',
        '443,80',
      ),
    ).toEqual({ protocol: 'https', port: '443' })
    expect(
      resolveBackendProxyForwarding(
        new URL('http://frontend:3000/api/auth/browser/token'),
        'https',
        '0',
      ),
    ).toEqual({ protocol: 'https', port: '443' })
  })

  it('ignores spoofed or multi-value protocols and falls back to the internal request', () => {
    const requestURL = new URL('http://frontend:3000/api/auth/browser/token')

    expect(resolveBackendProxyForwarding(requestURL, 'HTTP', '443')).toEqual({
      protocol: 'http',
      port: '3000',
    })
    expect(
      resolveBackendProxyForwarding(requestURL, 'https,http', '443'),
    ).toEqual({ protocol: 'http', port: '3000' })
    expect(resolveBackendProxyForwarding(requestURL)).toEqual({
      protocol: 'http',
      port: '3000',
    })
  })

  it('uses standard ports when the internal request has no explicit port', () => {
    expect(
      resolveBackendProxyForwarding(
        new URL('http://frontend/api/auth/browser/token'),
        'http',
        '80',
      ),
    ).toEqual({ protocol: 'http', port: '80' })
    expect(
      resolveBackendProxyForwarding(
        new URL('https://frontend/api/auth/browser/token'),
        'invalid',
        '443',
      ),
    ).toEqual({ protocol: 'https', port: '443' })
  })
})
