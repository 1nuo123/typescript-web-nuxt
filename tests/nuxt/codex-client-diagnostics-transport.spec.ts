import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CODEX_CLIENT_DIAGNOSTIC_PATH,
  CODEX_CLIENT_PERFORMANCE_DIAGNOSTIC_PATH,
  createCodexClientDiagnosticsPoster,
} from '~/services/api/codex-client-diagnostics'
import {
  ClientDiagnosticSummary,
  ClientPerformanceMetric,
  ClientPerformanceObservation,
  ClientPerformanceUnit,
  RuntimeLogSource,
  type ClientDiagnosticEnvelope,
  type ClientPerformanceDiagnosticEnvelope,
} from '~/types/app'
import { ClientPerformanceDiagnosticCollector } from '~/utils/client-performance-diagnostic'
import { CodexClientDiagnosticTransport } from '~/utils/codex-client-diagnostic-transport'

const buildDiagnosticEnvelope = (
  eventId = 'diagnostic-event-1',
): ClientDiagnosticEnvelope => ({
  header: {
    kind: 'client_diagnostic',
    schema_version: '1.0',
    event_id: eventId,
    source: RuntimeLogSource.Window,
    occurred_at: '2026-08-20T00:00:00.000Z',
  },
  detail: {
    kind: 'client_diagnostic_detail',
    schema_version: '1.0',
    summary: ClientDiagnosticSummary.WindowError,
    error_code: 'client.window.error',
    fingerprint: 'window:client.window.error',
  },
})

const buildPerformanceEnvelope = (): ClientPerformanceDiagnosticEnvelope => ({
  header: {
    kind: 'client_performance',
    schema_version: '1.0',
    event_id: 'performance-event-1',
    occurred_at: '2026-08-20T00:00:00.000Z',
  },
  detail: {
    kind: 'client_performance_detail',
    schema_version: '1.0',
    metric: ClientPerformanceMetric.ApproximateFps,
    observation: ClientPerformanceObservation.Observed,
    unit: ClientPerformanceUnit.FramesPerSecond,
    value: 58,
  },
})

const createTransport = (enabled: boolean): CodexClientDiagnosticTransport => {
  const poster = createCodexClientDiagnosticsPoster()
  return new CodexClientDiagnosticTransport({
    enabled,
    hasAccessToken: poster.hasAccessToken,
    postDiagnostic: poster.postDiagnostic,
    postPerformance: poster.postPerformance,
  })
}

describe('Codex client diagnostic transport', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    useAuthStore().$reset()
    useClientLogger().clear()
  })

  it('keeps transport disabled by default without starting a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('$fetch', fetchMock)

    const accepted = await createTransport(false).submitDiagnostic(
      buildDiagnosticEnvelope(),
    )

    expect(accepted).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts the exact diagnostic envelope to the configured API origin', async () => {
    const runtimeConfig = useRuntimeConfig()
    const previousBaseUrl = runtimeConfig.public.apiBaseURL
    runtimeConfig.public.apiBaseURL = 'https://diagnostics.example'
    const fetchMock = vi.fn().mockResolvedValue({
      header: { code: 'system.success.ok', message: 'ok', request_id: 'r-1' },
      data: { recorded: true },
    })
    vi.stubGlobal('$fetch', fetchMock)
    useAuthStore().accessToken = 'in-memory-token'
    const envelope = buildDiagnosticEnvelope()

    await expect(
      createTransport(true).submitDiagnostic(envelope),
    ).resolves.toBe(true)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(CODEX_CLIENT_DIAGNOSTIC_PATH)
    const options = fetchMock.mock.calls[0]?.[1] as {
      baseURL: string
      body: ClientDiagnosticEnvelope
      headers: Headers
      method: string
    }
    expect(options).toMatchObject({
      baseURL: 'https://diagnostics.example',
      body: envelope,
      method: 'POST',
    })
    expect(options.headers.get('Authorization')).toBe('Bearer in-memory-token')
    runtimeConfig.public.apiBaseURL = previousBaseUrl
  })

  it('drops missing-token and failed uploads without a queue or recursive log entry', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new Error('network unavailable'))
    vi.stubGlobal('$fetch', fetchMock)
    const missingTokenTransport = createTransport(true)
    const missingTokenEnvelope = buildDiagnosticEnvelope('diagnostic-no-token')

    await expect(
      missingTokenTransport.submitDiagnostic(missingTokenEnvelope),
    ).resolves.toBe(false)
    useAuthStore().accessToken = 'new-token'
    await expect(
      missingTokenTransport.submitDiagnostic(missingTokenEnvelope),
    ).resolves.toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()

    const logger = useClientLogger()
    logger.capture(new Error('original runtime failure'), {
      source: RuntimeLogSource.Request,
      code: 'client.transport.upload_failed',
    })
    const entry = logger.logs.value[0]!
    const failedTransport = createTransport(true)

    await expect(failedTransport.submitDiagnostic(entry)).resolves.toBe(false)
    await expect(failedTransport.submitDiagnostic(entry)).resolves.toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(logger.logs.value).toEqual([entry])
  })

  it('uploads only performance samples accepted by the stable collector decision', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      header: { code: 'system.success.ok', message: 'ok', request_id: 'r-1' },
      data: { recorded: true },
    })
    vi.stubGlobal('$fetch', fetchMock)
    useAuthStore().accessToken = 'in-memory-token'
    const transport = createTransport(true)
    const excludedCollector = new ClientPerformanceDiagnosticCollector({
      enabled: true,
      sessionKey: 'stable-excluded-session',
      sampleRate: 0,
      onRecord: (entry) => {
        void transport.submitPerformance(entry)
      },
    })
    const acceptedCollector = new ClientPerformanceDiagnosticCollector({
      enabled: true,
      sessionKey: 'stable-included-session',
      sampleRate: 1,
      createEventId: () => 'performance-event-1',
      now: () => new Date('2026-08-20T00:00:00.000Z'),
      onRecord: (entry) => {
        void transport.submitPerformance(entry)
      },
    })

    expect(
      excludedCollector.record({
        metric: ClientPerformanceMetric.ApproximateFps,
        observation: ClientPerformanceObservation.Observed,
        value: 58,
      }),
    ).toBeNull()
    const entry = acceptedCollector.record({
      metric: ClientPerformanceMetric.ApproximateFps,
      observation: ClientPerformanceObservation.Observed,
      value: 58,
    })
    await flushPromises()

    expect(entry).toEqual(buildPerformanceEnvelope())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      CODEX_CLIENT_PERFORMANCE_DIAGNOSTIC_PATH,
    )
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ body: entry })
  })
})
