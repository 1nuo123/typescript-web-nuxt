import { describe, expect, it } from 'vitest'
import {
  BACKEND_PROXY_COOKIE_PATH_REWRITE,
  PUBLIC_BROWSER_AUTH_COOKIE_PATH,
  buildBackendProxyTarget,
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
})
