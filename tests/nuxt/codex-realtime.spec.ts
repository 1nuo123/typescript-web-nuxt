import { defineComponent, nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  calculateCodexReconnectDelay,
  resolveCodexWebSocketUrl,
  useCodexRealtime,
} from '~/composables/useCodexRealtime.client'
import {
  CODEX_REALTIME_SCHEMA_VERSION,
  CodexRealtimeApplyResult,
  CodexRealtimeConnectionStatus,
  CodexRealtimeEventType,
} from '~/types/codex-realtime'
import { AuthSessionStatus } from '~/types/auth'

const envelope = <T>(data: T) => ({
  header: {
    code: 'system.success.ok',
    message: 'ok',
    request_id: 'request-1',
  },
  data,
})

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  readonly url: string
  closeCalls: { code?: number; reason?: string }[] = []
  private listeners = new Map<string, EventListener[]>()

  constructor(url: string | URL) {
    this.url = String(url)
    FakeWebSocket.instances.push(this)
  }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  close(code?: number, reason?: string): void {
    if (
      code !== undefined &&
      code !== 1_000 &&
      (code < 3_000 || code > 4_999)
    ) {
      throw new DOMException(
        'The close code must be either 1000, or between 3000 and 4999.',
        'InvalidAccessError',
      )
    }
    this.closeCalls.push({ code, reason })
    this.emit('close', new Event('close'))
  }

  emit(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

const RealtimeHarness = defineComponent({
  setup() {
    useCodexRealtime()
    return () => null
  },
})

describe('Codex realtime client', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    FakeWebSocket.instances = []
    useCodexRealtimeStore().$reset()
    useCodexSessionStore().$reset()
    useAuthStore().$reset()
  })

  it('derives a WSS URL without putting the access token in the query', () => {
    const url = resolveCodexWebSocketUrl({
      pageUrl: 'https://codex.example/codex/tasks',
      apiBaseUrl: 'https://codex.example',
      configuredWsBaseUrl: '',
      realtimePath: '/codex/events',
      ticket: 'one-time-ticket',
    })

    expect(url).toBe('wss://codex.example/codex/events?ticket=one-time-ticket')
    expect(url).not.toContain('access')
    expect(calculateCodexReconnectDelay(0, 0.5)).toBe(1_000)
    expect(calculateCodexReconnectDelay(99, 0.5)).toBe(30_000)
  })

  it('detects an explicit stream gap and does not project it as product data', () => {
    const store = useCodexRealtimeStore()
    const base = {
      kind: 'codex_realtime_event' as const,
      schema_version: CODEX_REALTIME_SCHEMA_VERSION,
      stream_epoch: 'epoch-1',
      host_id: 'host-1',
      type: CodexRealtimeEventType.ProtocolWarning,
    } as const
    expect(
      store.acceptEvent({
        ...base,
        cursor: 'cursor-0',
        event_id: 'event-0',
        payload: { warning: 'first' },
      }),
    ).toBe(CodexRealtimeApplyResult.NewStreamEpoch)
    expect(
      store.acceptEvent({
        ...base,
        cursor: null,
        event_id: 'event-2',
        type: CodexRealtimeEventType.StreamGapDetected,
        payload: { reason: 'cursor_trimmed', snapshot_required: true },
      }),
    ).toBe(CodexRealtimeApplyResult.Gap)
    expect(store.gapDetected).toBe(true)
    expect(useCodexSessionStore().projection.protocolWarnings).toEqual([])
  })

  it('requests a one-time ticket and consumes connection.ready', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(envelope({ ticket: 'ticket-1' }))
    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal('WebSocket', FakeWebSocket)
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    })
    const runtimeConfig = useRuntimeConfig()
    runtimeConfig.public.codexFeatureEnabled = true
    runtimeConfig.public.apiBaseURL = 'http://127.0.0.1:8000'
    runtimeConfig.public.codexRealtimePath = '/codex/events'
    runtimeConfig.public.codexWsBaseUrl = ''
    const authStore = useAuthStore()
    authStore.status = AuthSessionStatus.Authenticated
    authStore.accessToken = 'access-token'

    const component = await mountSuspended(RealtimeHarness)
    await flushPromises()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/codex/realtime-tickets')
    expect(FakeWebSocket.instances[0]?.url).toBe(
      'ws://127.0.0.1:8000/codex/events?ticket=ticket-1',
    )

    FakeWebSocket.instances[0]?.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({
          kind: 'codex_realtime_event',
          schema_version: CODEX_REALTIME_SCHEMA_VERSION,
          stream_epoch: 'epoch-1',
          cursor: null,
          event_id: 'event-0',
          host_id: 'host-1',
          type: CodexRealtimeEventType.ConnectionReady,
          payload: {
            heartbeat_interval: 10,
            server_time: '2026-08-01T00:00:00Z',
          },
        }),
      }),
    )
    await nextTick()

    expect(useCodexRealtimeStore().status).toBe(
      CodexRealtimeConnectionStatus.Connected,
    )
    FakeWebSocket.instances[0]?.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({
          kind: 'codex_realtime_event',
          schema_version: CODEX_REALTIME_SCHEMA_VERSION,
          stream_epoch: 'epoch-1',
          cursor: '1-0',
          event_id: 'event-1',
          host_id: 'host-1',
          type: CodexRealtimeEventType.ProtocolWarning,
          payload: { warning: 'mapped warning' },
        }),
      }),
    )
    await nextTick()
    expect(useCodexSessionStore().projection.protocolWarnings).toEqual([
      'mapped warning',
    ])
    component.unmount()
  })

  it('uses browser-legal application close codes for protocol failures', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn().mockResolvedValue(envelope({ ticket: 'ticket-1' })),
    )
    vi.stubGlobal('WebSocket', FakeWebSocket)
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    })
    const runtimeConfig = useRuntimeConfig()
    runtimeConfig.public.codexFeatureEnabled = true
    runtimeConfig.public.apiBaseURL = 'http://127.0.0.1:8000'
    runtimeConfig.public.codexRealtimePath = '/codex/events'
    runtimeConfig.public.codexWsBaseUrl = ''

    await mountSuspended(RealtimeHarness)
    await flushPromises()
    FakeWebSocket.instances[0]?.emit(
      'message',
      new MessageEvent('message', { data: '{' }),
    )
    await nextTick()

    expect(FakeWebSocket.instances[0]?.closeCalls[0]?.code).toBe(4_002)
  })
})
