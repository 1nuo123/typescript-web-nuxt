import { expect, test } from '@nuxt/test-utils/playwright'
import type { WebSocketRoute } from '@playwright/test'

const envelope = (data: unknown) => ({
  header: {
    code: 'system.success.ok',
    message: 'ok',
    request_id: 'connection-e2e',
  },
  data,
})
const controlEvent = (kind: 'connection.ready' | 'connection.heartbeat') =>
  JSON.stringify({
    header: {
      kind: 'codex_realtime_event',
      schema_version: '2.0',
      stream_epoch: 'connection-e2e',
      cursor: null,
      event_id: crypto.randomUUID(),
      occurred_at: new Date().toISOString(),
      host_id: '00000000-0000-0000-0000-000000000000',
      workspace_id: null,
      thread_id: null,
      turn_id: null,
      item_id: null,
      detail_kind: kind,
    },
    detail: {
      schema_version: '2.0',
      kind,
      server_time: new Date().toISOString(),
      ...(kind === 'connection.ready' ? { heartbeat_interval: 15 } : {}),
    },
  })

test('browser connection requires application ready and identifies its own offline state', async ({
  page,
  context,
  goto,
}) => {
  test.skip(process.env.NUXT_TEST_CODEX_FEATURE_ENABLED !== 'true')
  const sockets: WebSocketRoute[] = []
  await page.routeWebSocket('**/codex/events*', (socket) => {
    sockets.push(socket)
  })
  await page.route('http://127.0.0.1:8000/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const headers = {
      'access-control-allow-origin': 'http://127.0.0.1:3320',
      'access-control-allow-credentials': 'true',
      'content-type': 'application/json',
    }
    let data: unknown
    if (path === '/auth/browser/refresh')
      data = {
        kind: 'browser_token_issue',
        schema_version: '1.0',
        access_token: 'connection-e2e',
        token_type: 'Bearer',
        expires_in_seconds: 3600,
      }
    else if (path === '/auth/me')
      data = {
        kind: 'authenticated_principal',
        schema_version: '1.0',
        subject_id: 'connection-e2e',
        username: 'connection-e2e',
        roles: ['registered_user'],
        scopes: [
          'codex:read',
          'codex:operate',
          'codex:approve',
          'codex:host:manage',
        ],
        is_admin: false,
      }
    else if (path === '/codex/experience/feature-flags')
      data = {
        codex_scroll_controller_v2: false,
        codex_realtime_batch_v2: false,
        codex_authority_recovery_v2: false,
      }
    else if (path === '/codex/realtime-tickets')
      data = { ticket: crypto.randomUUID(), expires_at: null }
    else if (path === '/codex/active-host')
      data = {
        active_host_id: null,
        target_host_id: null,
        draining_host_id: null,
        version: 0,
      }
    else data = { items: [] }
    await route.fulfill({
      status: 200,
      headers,
      body: JSON.stringify(envelope(data)),
    })
  })
  await goto('/codex/tasks', { waitUntil: 'hydration' })
  await expect.poll(() => sockets.length).toBe(1)
  await expect(page.getByText('正在连接实时服务…')).toBeVisible()
  sockets[0]!.send(controlEvent('connection.ready'))
  await expect(page.getByText('正在连接实时服务…')).toHaveCount(0)
  sockets[0]!.send(controlEvent('connection.heartbeat'))
  await context.setOffline(true)
  await expect(page.getByText(/浏览器网络已断开/)).toBeVisible()
  await expect(page.getByText(/本机会话会继续/)).toHaveCount(0)
  await context.setOffline(false)
  await expect.poll(() => sockets.length).toBe(2)
  sockets[1]!.send(controlEvent('connection.ready'))
  await expect(page.getByText(/浏览器网络已断开/)).toHaveCount(0)
  await expect(page.getByText('正在连接实时服务…')).toHaveCount(0)
})
