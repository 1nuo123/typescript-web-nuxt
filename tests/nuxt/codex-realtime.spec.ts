import { defineComponent, nextTick } from 'vue'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  calculateCodexReconnectDelay,
  resolveCodexWebSocketUrl,
  useCodexRealtime,
} from '~/composables/useCodexRealtime.client'
import {
  CODEX_REALTIME_BATCH_PROTOCOL_VERSION,
  CODEX_REALTIME_SCHEMA_VERSION,
  CodexRealtimeApplyResult,
  CodexRealtimeConnectionStatus,
  CodexRealtimeEventType,
  type CodexRealtimeEvent,
} from '~/types/codex-realtime'
import {
  ClientPerformanceMetric,
  ClientPerformanceObservation,
} from '~/types/app'
import { AuthSessionStatus } from '~/types/auth'
import type { CodexExperienceFeatureFlags } from '~/types/codex-feature-flags'
import { ClientPerformanceDiagnosticCollector } from '~/utils/client-performance-diagnostic'
import {
  CODEX_EXPERIENCE_FEATURE_FLAGS_LOADED_STATE_KEY,
  CODEX_EXPERIENCE_FEATURE_FLAGS_STATE_KEY,
} from '~/composables/useCodexExperienceFeatureFlags'

const envelope = <T>(data: T) => ({
  header: {
    code: 'system.success.ok',
    message: 'ok',
    request_id: 'request-1',
  },
  data,
})
const TEST_OCCURRED_AT = '2026-08-01T00:00:00.000Z'
const DEFAULT_FEATURE_FLAGS: CodexExperienceFeatureFlags = {
  codex_scroll_controller_v2: false,
  codex_realtime_batch_v2: false,
  codex_authority_recovery_v2: true,
}

const setAuthoritativeFeatureFlags = (
  overrides: Partial<CodexExperienceFeatureFlags> = {},
): void => {
  useState<CodexExperienceFeatureFlags>(
    CODEX_EXPERIENCE_FEATURE_FLAGS_STATE_KEY,
  ).value = { ...DEFAULT_FEATURE_FLAGS, ...overrides }
  useState<boolean>(CODEX_EXPERIENCE_FEATURE_FLAGS_LOADED_STATE_KEY).value =
    true
}

const protocolWarningEvent = (
  cursor: string,
  eventId: string,
): Extract<
  CodexRealtimeEvent,
  { detail: { kind: CodexRealtimeEventType.ProtocolWarning } }
> => ({
  header: {
    kind: 'codex_realtime_event',
    schema_version: CODEX_REALTIME_SCHEMA_VERSION,
    stream_epoch: 'epoch-1',
    cursor,
    event_id: eventId,
    occurred_at: TEST_OCCURRED_AT,
    host_id: 'host-1',
    detail_kind: CodexRealtimeEventType.ProtocolWarning,
  },
  detail: {
    kind: CodexRealtimeEventType.ProtocolWarning,
    schema_version: CODEX_REALTIME_SCHEMA_VERSION,
    warning: eventId,
  },
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
  beforeEach(() => {
    const runtimeConfig = useRuntimeConfig()
    runtimeConfig.public.codexPerformanceDiagnosticsEnabled = true
    runtimeConfig.public.codexPerformanceDiagnosticsSampleRate = 1
    setAuthoritativeFeatureFlags()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(navigator, 'connection')
    FakeWebSocket.instances = []
    useCodexRealtimeStore().$reset()
    useCodexSessionStore().$reset()
    useAuthStore().$reset()
    setAuthoritativeFeatureFlags()
    useNuxtApp().$codexClientPerformanceDiagnostics.clear()
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
    expect(calculateCodexReconnectDelay(0, 0.5)).toBe(500)
    expect(calculateCodexReconnectDelay(99, 0.5)).toBe(15_000)
  })

  it('adds the batch version only when the v2 path is enabled', () => {
    const url = resolveCodexWebSocketUrl({
      pageUrl: 'https://codex.example/codex/tasks',
      apiBaseUrl: 'https://codex.example',
      configuredWsBaseUrl: '',
      realtimePath: '/codex/events',
      ticket: 'one-time-ticket',
      batchVersion: 2,
    })

    expect(url).toContain('batch_version=2')
  })

  it('keeps the legacy realtime URL when the v2 batch flag is disabled', () => {
    const url = resolveCodexWebSocketUrl({
      pageUrl: 'https://codex.example/codex/tasks',
      apiBaseUrl: 'https://codex.example',
      configuredWsBaseUrl: '',
      realtimePath: '/codex/events',
      ticket: 'one-time-ticket',
      batchVersion: 1,
    })

    expect(url).not.toContain('batch_version')
  })

  it('detects an explicit stream gap and does not project it as product data', () => {
    const store = useCodexRealtimeStore()
    expect(
      store.acceptEvent({
        header: {
          kind: 'codex_realtime_event',
          schema_version: CODEX_REALTIME_SCHEMA_VERSION,
          stream_epoch: 'epoch-1',
          host_id: 'host-1',
          cursor: 'cursor-0',
          event_id: 'event-0',
          occurred_at: TEST_OCCURRED_AT,
          detail_kind: CodexRealtimeEventType.ProtocolWarning,
        },
        detail: {
          kind: CodexRealtimeEventType.ProtocolWarning,
          schema_version: CODEX_REALTIME_SCHEMA_VERSION,
          warning: 'first',
        },
      }),
    ).toBe(CodexRealtimeApplyResult.NewStreamEpoch)
    expect(
      store.acceptEvent({
        header: {
          kind: 'codex_realtime_event',
          schema_version: CODEX_REALTIME_SCHEMA_VERSION,
          stream_epoch: 'epoch-1',
          host_id: 'host-1',
          cursor: null,
          event_id: 'event-2',
          occurred_at: TEST_OCCURRED_AT,
          detail_kind: CodexRealtimeEventType.StreamGapDetected,
        },
        detail: {
          kind: CodexRealtimeEventType.StreamGapDetected,
          schema_version: CODEX_REALTIME_SCHEMA_VERSION,
          reason: 'cursor_trimmed',
          snapshot_required: true,
        },
      }),
    ).toBe(CodexRealtimeApplyResult.Gap)
    expect(store.gapDetected).toBe(true)
    expect(useCodexSessionStore().projection.protocolWarnings).toEqual([])
  })

  it('treats a repeated cursor as idempotent without inferring a cursor gap', () => {
    const store = useCodexRealtimeStore()
    const first: Extract<
      CodexRealtimeEvent,
      { detail: { kind: CodexRealtimeEventType.ProtocolWarning } }
    > = {
      header: {
        kind: 'codex_realtime_event' as const,
        schema_version: CODEX_REALTIME_SCHEMA_VERSION,
        stream_epoch: 'epoch-1',
        host_id: 'host-1',
        cursor: 'cursor-1',
        event_id: 'event-1',
        occurred_at: TEST_OCCURRED_AT,
        detail_kind: CodexRealtimeEventType.ProtocolWarning,
      },
      detail: {
        kind: CodexRealtimeEventType.ProtocolWarning,
        schema_version: CODEX_REALTIME_SCHEMA_VERSION,
        warning: 'once',
      },
    }

    expect(store.acceptEvent(first)).toBe(
      CodexRealtimeApplyResult.NewStreamEpoch,
    )
    expect(
      store.acceptEvent({
        ...first,
        header: { ...first.header, event_id: 'event-duplicate' },
      }),
    ).toBe(CodexRealtimeApplyResult.Duplicate)
    expect(store.lastCursor).toBe('cursor-1')
    expect(store.gapDetected).toBe(false)
  })

  it('reducer_epoch_change_requests_resync', async () => {
    let finishAuthorityRefresh: (() => void) | undefined
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
    const sessionStore = useCodexSessionStore()
    const refreshAuthority = vi
      .spyOn(sessionStore, 'refreshAuthority')
      .mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finishAuthorityRefresh = resolve
          }),
      )

    const component = await mountSuspended(RealtimeHarness)
    await flushPromises()
    const socket = FakeWebSocket.instances[0]
    const emitWarning = (
      epoch: string,
      cursor: string,
      eventId: string,
    ): void =>
      socket?.emit(
        'message',
        new MessageEvent('message', {
          data: JSON.stringify({
            header: {
              kind: 'codex_realtime_event',
              schema_version: CODEX_REALTIME_SCHEMA_VERSION,
              stream_epoch: epoch,
              cursor,
              event_id: eventId,
              occurred_at: TEST_OCCURRED_AT,
              host_id: 'host-1',
              detail_kind: CodexRealtimeEventType.ProtocolWarning,
            },
            detail: {
              kind: CodexRealtimeEventType.ProtocolWarning,
              schema_version: CODEX_REALTIME_SCHEMA_VERSION,
              warning: eventId,
            },
          }),
        }),
      )

    emitWarning('epoch-1', 'cursor-1', 'event-1')
    await nextTick()
    emitWarning('epoch-2', 'cursor-1', 'event-2')

    await vi.waitFor(() => expect(refreshAuthority).toHaveBeenCalledTimes(1))
    expect(useCodexRealtimeStore().status).toBe(
      CodexRealtimeConnectionStatus.Resyncing,
    )
    finishAuthorityRefresh!()
    await flushPromises()

    expect(useCodexRealtimeStore().status).toBe(
      CodexRealtimeConnectionStatus.Connected,
    )
    component.unmount()
  })

  it('keeps legacy authority recovery out of the resyncing state when disabled', async () => {
    vi.stubGlobal(
      '$fetch',
      vi.fn().mockResolvedValue(envelope({ ticket: 'ticket-legacy' })),
    )
    vi.stubGlobal('WebSocket', FakeWebSocket)
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    })
    const runtimeConfig = useRuntimeConfig()
    runtimeConfig.public.codexFeatureEnabled = true
    setAuthoritativeFeatureFlags({ codex_authority_recovery_v2: false })
    const sessionStore = useCodexSessionStore()
    const refreshAuthority = vi
      .spyOn(sessionStore, 'refreshAuthority')
      .mockResolvedValue()
    const component = await mountSuspended(RealtimeHarness)
    await flushPromises()
    const socket = FakeWebSocket.instances[0]
    const emitWarning = (epoch: string, cursor: string, eventId: string) => {
      const event = protocolWarningEvent(cursor, eventId)
      socket?.emit(
        'message',
        new MessageEvent('message', {
          data: JSON.stringify({
            ...event,
            header: { ...event.header, stream_epoch: epoch },
          }),
        }),
      )
    }

    emitWarning('epoch-1', 'cursor-1', 'legacy-1')
    emitWarning('epoch-2', 'cursor-1', 'legacy-2')

    await vi.waitFor(() => expect(refreshAuthority).toHaveBeenCalledTimes(1))
    expect(useCodexRealtimeStore().status).not.toBe(
      CodexRealtimeConnectionStatus.Resyncing,
    )
    component.unmount()
  })

  it('frames normal events into one projection commit every 40 milliseconds', async () => {
    vi.useFakeTimers()
    const record = vi.spyOn(
      ClientPerformanceDiagnosticCollector.prototype,
      'record',
    )
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
    const component = await mountSuspended(RealtimeHarness)
    await flushPromises()
    const sessionStore = useCodexSessionStore()
    const applyRealtimeBatch = vi.spyOn(sessionStore, 'applyRealtimeBatch')
    const socket = FakeWebSocket.instances[0]

    const events = [
      protocolWarningEvent('cursor-1', 'event-1'),
      protocolWarningEvent('cursor-2', 'event-2'),
    ]
    socket?.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({
          protocol_version: CODEX_REALTIME_BATCH_PROTOCOL_VERSION,
          stream_epoch: 'epoch-1',
          first_cursor: 'cursor-1',
          last_cursor: 'cursor-2',
          barrier: false,
          events,
        }),
      }),
    )
    await nextTick()
    expect(applyRealtimeBatch).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(40)

    expect(applyRealtimeBatch).toHaveBeenCalledTimes(1)
    expect(applyRealtimeBatch.mock.calls[0]?.[0]).toHaveLength(2)
    expect(record).toHaveBeenCalledWith({
      metric: ClientPerformanceMetric.RealtimeBatchEventCount,
      observation: ClientPerformanceObservation.NormalBatch,
      value: 2,
    })
    expect(record).toHaveBeenCalledWith({
      metric: ClientPerformanceMetric.RealtimeBatchBytes,
      observation: ClientPerformanceObservation.NormalBatch,
      value: expect.any(Number),
    })
    component.unmount()
  })

  it('flushes queued events before an explicit realtime batch barrier', async () => {
    vi.useFakeTimers()
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
    const component = await mountSuspended(RealtimeHarness)
    await flushPromises()
    const sessionStore = useCodexSessionStore()
    const applyRealtimeBatch = vi.spyOn(sessionStore, 'applyRealtimeBatch')
    const socket = FakeWebSocket.instances[0]
    const queued = protocolWarningEvent('cursor-1', 'event-1')
    const barrier = protocolWarningEvent('cursor-2', 'event-2')

    socket?.emit(
      'message',
      new MessageEvent('message', { data: JSON.stringify(queued) }),
    )
    socket?.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({
          protocol_version: CODEX_REALTIME_BATCH_PROTOCOL_VERSION,
          stream_epoch: 'epoch-1',
          first_cursor: 'cursor-2',
          last_cursor: 'cursor-2',
          barrier: true,
          events: [barrier],
        }),
      }),
    )
    await nextTick()

    expect(applyRealtimeBatch).toHaveBeenCalledTimes(1)
    expect(applyRealtimeBatch.mock.calls[0]?.[0]).toEqual([queued, barrier])
    component.unmount()
  })

  it('requests a one-time ticket and consumes connection.ready', async () => {
    vi.useFakeTimers()
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

    FakeWebSocket.instances[0]?.emit('open', new Event('open'))
    expect(useCodexRealtimeStore().status).toBe(
      CodexRealtimeConnectionStatus.Connected,
    )

    FakeWebSocket.instances[0]?.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({
          header: {
            kind: 'codex_realtime_event',
            schema_version: CODEX_REALTIME_SCHEMA_VERSION,
            stream_epoch: 'epoch-1',
            cursor: null,
            event_id: 'event-0',
            occurred_at: TEST_OCCURRED_AT,
            host_id: 'host-1',
            detail_kind: CodexRealtimeEventType.ConnectionReady,
          },
          detail: {
            kind: CodexRealtimeEventType.ConnectionReady,
            schema_version: CODEX_REALTIME_SCHEMA_VERSION,
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
          header: {
            kind: 'codex_realtime_event',
            schema_version: CODEX_REALTIME_SCHEMA_VERSION,
            stream_epoch: 'epoch-1',
            cursor: '1-0',
            event_id: 'event-1',
            occurred_at: TEST_OCCURRED_AT,
            host_id: 'host-1',
            detail_kind: CodexRealtimeEventType.ProtocolWarning,
          },
          detail: {
            kind: CodexRealtimeEventType.ProtocolWarning,
            schema_version: CODEX_REALTIME_SCHEMA_VERSION,
            warning: 'mapped warning',
          },
        }),
      }),
    )
    await vi.advanceTimersByTimeAsync(40)
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

  it('does not retry a forbidden realtime ticket request', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      '$fetch',
      vi.fn().mockRejectedValue({
        statusCode: 403,
        statusMessage: 'Forbidden',
        data: {
          header: { code: 'codex.state.conflict', message: 'Origin rejected' },
          data: {
            status_code: 403,
            error_code: 'codex.state.conflict',
          },
        },
      }),
    )
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    })
    const runtimeConfig = useRuntimeConfig()
    runtimeConfig.public.codexFeatureEnabled = true

    await mountSuspended(RealtimeHarness)
    await flushPromises()
    await vi.advanceTimersByTimeAsync(31_000)

    expect(useCodexRealtimeStore().status).toBe(
      CodexRealtimeConnectionStatus.Error,
    )
    expect(useCodexRealtimeStore().reconnectAttempt).toBe(0)
  })

  it('drops events emitted by an old socket generation after reconnect', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
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

    const component = await mountSuspended(RealtimeHarness)
    await flushPromises()
    const oldSocket = FakeWebSocket.instances[0]
    oldSocket?.emit('close', new Event('close'))
    await vi.advanceTimersByTimeAsync(500)
    await flushPromises()
    const currentSocket = FakeWebSocket.instances[1]
    expect(currentSocket).toBeTruthy()

    oldSocket?.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({
          header: {
            kind: 'codex_realtime_event',
            schema_version: CODEX_REALTIME_SCHEMA_VERSION,
            stream_epoch: 'epoch-1',
            cursor: 'old-1',
            event_id: 'old-event',
            occurred_at: TEST_OCCURRED_AT,
            host_id: 'host-1',
            detail_kind: CodexRealtimeEventType.ProtocolWarning,
          },
          detail: {
            kind: CodexRealtimeEventType.ProtocolWarning,
            schema_version: CODEX_REALTIME_SCHEMA_VERSION,
            warning: 'old socket must be ignored',
          },
        }),
      }),
    )
    await nextTick()

    expect(useCodexSessionStore().projection.protocolWarnings).toEqual([])
    component.unmount()
  })

  it('reconnects immediately when the browser network information changes', async () => {
    const networkInformation = new EventTarget()
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: networkInformation,
    })
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

    const component = await mountSuspended(RealtimeHarness)
    await flushPromises()
    const initialSocket = FakeWebSocket.instances[0]
    networkInformation.dispatchEvent(new Event('change'))
    await flushPromises()

    expect(initialSocket?.closeCalls).toEqual([
      expect.objectContaining({ code: 4_001 }),
    ])
    expect(FakeWebSocket.instances).toHaveLength(2)
    component.unmount()
  })
})
