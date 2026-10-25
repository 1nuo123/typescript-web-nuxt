import {
  ClientPerformanceMetric,
  ClientPerformanceObservation,
} from '~/types/app'
import {
  CodexRealtimeApplyResult,
  CodexRealtimeEventType,
  type CodexRealtimeEvent,
} from '~/types/codex-realtime'
import type { CodexRealtimeCheckpoint } from '~/stores/codex-realtime'
import {
  CodexRealtimeContractError,
  validateCodexRealtimeBatch,
  validateCodexRealtimeEvent,
} from '~/utils/codex-event-validator'
import { normalizeApiError } from '~/utils/errors'

const RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000, 15_000]
const RECONNECT_JITTER_RATIO = 0.2
const DEFAULT_IDLE_TIMEOUT_MS = 60_000
// One bounded attempt covers ticket, transport and application readiness.
const CONNECTION_ATTEMPT_TIMEOUT_MS = 30_000
const NORMAL_EVENT_FRAME_WINDOW_MS = 40
const NORMAL_CLOSE_CODE = 1_000
const OFFLINE_CLOSE_CODE = 4_001
const PROTOCOL_CLOSE_CODE = 4_002
const RETRIABLE_HTTP_STATUS_CODES = new Set([
  408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524,
])

/** 浏览器非标准 Network Information API 的受控最小边界。 */
interface CodexNetworkInformation {
  addEventListener(type: 'change', listener: EventListener): void
  removeEventListener(type: 'change', listener: EventListener): void
}

interface CodexNetworkInformationNavigator extends Navigator {
  connection?: CodexNetworkInformation
  mozConnection?: CodexNetworkInformation
  webkitConnection?: CodexNetworkInformation
}

const readCodexNetworkInformation = (): CodexNetworkInformation | null => {
  const browserNavigator = navigator as CodexNetworkInformationNavigator
  return (
    browserNavigator.connection ??
    browserNavigator.mozConnection ??
    browserNavigator.webkitConnection ??
    null
  )
}

const isRealtimeBarrierEvent = (event: CodexRealtimeEvent): boolean =>
  [
    CodexRealtimeEventType.ApprovalOpened,
    CodexRealtimeEventType.ApprovalResolved,
    CodexRealtimeEventType.StreamGapDetected,
    CodexRealtimeEventType.TurnCompleted,
    CodexRealtimeEventType.TurnFailed,
    CodexRealtimeEventType.TurnInterrupted,
  ].includes(event.detail.kind)

const isRetriableRealtimeError = (error: unknown): boolean => {
  const normalized = normalizeApiError(error)
  return (
    normalized.statusCode === 0 ||
    RETRIABLE_HTTP_STATUS_CODES.has(normalized.statusCode)
  )
}

const realtimeErrorMessage = (error: unknown): string => {
  const normalized = normalizeApiError(error)
  if (normalized.statusCode === 401) {
    return '登录状态已失效，请重新登录后继续。'
  }
  if (normalized.statusCode === 403) {
    return 'Codex实时连接被拒绝，请检查来源配置或账号权限。'
  }
  if (normalized.statusCode >= 400 && normalized.statusCode < 500) {
    return normalized.message || 'Codex实时请求配置无效。'
  }
  return 'Codex实时服务暂不可用，正在重试。'
}

export interface CodexWebSocketUrlInput {
  pageUrl: string
  apiBaseUrl: string
  configuredWsBaseUrl: string
  realtimePath: string
  ticket: string
  cursor?: string | null
  streamEpoch?: string | null
  batchVersion?: 1 | 2
}

export const calculateCodexReconnectDelay = (
  attempt: number,
  randomValue = Math.random(),
): number => {
  const index = Math.min(Math.max(attempt, 0), RECONNECT_DELAYS_MS.length - 1)
  const baseDelay = RECONNECT_DELAYS_MS[index] ?? RECONNECT_DELAYS_MS[0]!
  const jitter = (randomValue * 2 - 1) * RECONNECT_JITTER_RATIO
  return Math.round(baseDelay * (1 + jitter))
}

export const resolveCodexWebSocketUrl = ({
  pageUrl,
  apiBaseUrl,
  configuredWsBaseUrl,
  realtimePath,
  ticket,
  cursor,
  streamEpoch,
  batchVersion = 1,
}: CodexWebSocketUrlInput): string => {
  const page = new URL(pageUrl)
  const api = new URL(apiBaseUrl || page.origin, page.origin)
  const explicitBase = configuredWsBaseUrl.trim()
  const target = new URL(explicitBase || api.origin, page.origin)

  if (!explicitBase && target.origin !== api.origin) {
    throw new Error('Codex WebSocket目标必须与API origin一致。')
  }
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(target.protocol)) {
    throw new Error('Codex WebSocket目标协议不受支持。')
  }
  target.protocol =
    target.protocol === 'https:' || target.protocol === 'wss:' ? 'wss:' : 'ws:'
  const resolved = new URL(realtimePath, target)
  resolved.searchParams.set('ticket', ticket)
  if (cursor) resolved.searchParams.set('cursor', cursor)
  if (streamEpoch) resolved.searchParams.set('stream_epoch', streamEpoch)
  if (batchVersion === 2) resolved.searchParams.set('batch_version', '2')
  return resolved.toString()
}

export const useCodexRealtime = () => {
  const runtimeConfig = useRuntimeConfig()
  const experienceFlags = useCodexExperienceFeatureFlags()
  const realtimeStore = useCodexRealtimeStore()
  const sessionStore = useCodexSessionStore()
  const approvalsStore = useCodexApprovalsStore()
  const authStore = useAuthStore()
  const performanceDiagnostics = useCodexClientPerformanceDiagnostics()
  const authorityRecoveryV2Enabled = (): boolean =>
    experienceFlags.isEnabled('codex_authority_recovery_v2')
  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let attemptTimer: ReturnType<typeof setTimeout> | null = null
  let recoveryTimer: ReturnType<typeof setTimeout> | null = null
  let ticketController: AbortController | null = null
  let recoveryAttempt = 0
  let recoveryGeneration: number | null = null
  let projectionFlushTimer: ReturnType<typeof setTimeout> | null = null
  let projectionFlushRevision = 0
  let queuedProjectionEvents: CodexRealtimeEvent[] = []
  let queuedProjectionGeneration: number | null = null
  let queuedRecoveryRequired = false
  let queuedRealtimeCheckpoint: CodexRealtimeCheckpoint | null = null
  let manuallyClosed = false
  let protocolCompatible = true
  let authRecoveryInFlight: Promise<'success' | 'retry' | 'terminal'> | null =
    null
  let recoveryController: AbortController | null = null
  let transportRecoveryStartedAt: number | null = null
  let connectInFlight: Promise<void> | null = null
  let reconnectAfterAttemptGeneration: number | null = null
  let controllerGeneration = 0
  let networkInformation: CodexNetworkInformation | null = null

  const clearTimers = (): void => {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    if (idleTimer) clearTimeout(idleTimer)
    if (attemptTimer) clearTimeout(attemptTimer)
    if (recoveryTimer) clearTimeout(recoveryTimer)
    ticketController?.abort()
    ticketController = null
    attemptTimer = null
    recoveryTimer = null
    reconnectTimer = null
    idleTimer = null
  }

  /** 连接代次切换或页面卸载时丢弃未提交事件，旧连接不得延迟写入投影。 */
  const clearProjectionQueue = (): void => {
    if (projectionFlushTimer !== null) clearTimeout(projectionFlushTimer)
    projectionFlushRevision += 1
    projectionFlushTimer = null
    queuedProjectionEvents = []
    queuedProjectionGeneration = null
    queuedRecoveryRequired = false
    if (queuedRealtimeCheckpoint) {
      realtimeStore.restoreCheckpoint(queuedRealtimeCheckpoint)
      queuedRealtimeCheckpoint = null
    }
  }

  /**
   * Ticket issuance cannot be aborted through the current API client, so a
   * lifecycle change invalidates its generation and releases the singleflight
   * slot. A late ticket may resolve, but it can no longer open a socket or
   * suppress the replacement connection.
   */
  const invalidateConnectionAttempt = (): WebSocket | null => {
    recoveryController?.abort()
    recoveryController = null
    realtimeStore.historyStatus = 'idle'
    controllerGeneration += 1
    connectInFlight = null
    reconnectAfterAttemptGeneration = null
    clearTimers()
    clearProjectionQueue()
    const previousSocket = socket
    realtimeStore.connectedAt = null
    socket = null
    return previousSocket
  }

  const isCurrent = (generation: number): boolean =>
    generation === controllerGeneration && !manuallyClosed

  const resetIdleTimer = (generation: number, socketRef: WebSocket): void => {
    if (!isCurrent(generation)) return
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      if (isCurrent(generation))
        socketRef.close(OFFLINE_CLOSE_CODE, 'Codex实时连接空闲超时。')
    }, DEFAULT_IDLE_TIMEOUT_MS)
  }

  const refreshAuthority = async (generation: number): Promise<void> => {
    if (!isCurrent(generation) || recoveryGeneration === generation) return
    recoveryGeneration = generation
    const authorityStartedAt = performance.now()
    recoveryController?.abort()
    const controller = new AbortController()
    recoveryController = controller
    realtimeStore.beginResync()
    try {
      await Promise.all([
        sessionStore.refreshAuthority(controller.signal),
        approvalsStore.load(),
      ])
      if (!isCurrent(generation) || controller.signal.aborted) return
      recoveryAttempt = 0
      realtimeStore.finishResync()
      performanceDiagnostics.record({
        metric: ClientPerformanceMetric.AuthorityRecoveryMilliseconds,
        observation: ClientPerformanceObservation.Observed,
        value: performance.now() - authorityStartedAt,
      })
      const historyStartedAt = performance.now()
      realtimeStore.historyStatus = 'loading'
      void sessionStore.loadThreadSnapshot(true, controller.signal).then(
        () => {
          if (isCurrent(generation) && !controller.signal.aborted) {
            realtimeStore.historyStatus = 'ready'
            performanceDiagnostics.record({
              metric: ClientPerformanceMetric.HistoryLoadMilliseconds,
              observation: ClientPerformanceObservation.Observed,
              value: performance.now() - historyStartedAt,
            })
          }
        },
        () => {
          if (isCurrent(generation) && !controller.signal.aborted)
            realtimeStore.historyStatus = 'failed'
        },
      )
    } catch {
      if (isCurrent(generation) && !controller.signal.aborted) {
        realtimeStore.lastError = '结果同步暂时失败，正在重试。'
        recoveryTimer = setTimeout(() => {
          recoveryTimer = null
          void refreshAuthority(generation)
        }, calculateCodexReconnectDelay(recoveryAttempt++))
      }
    } finally {
      if (recoveryController === controller) recoveryGeneration = null
    }
  }

  /**
   * 每个浏览器帧窗口只提交一次 Pinia projection；屏障先提交前序普通事件，
   * 因而终态和审批不会被普通 delta 延后。
   */
  const flushProjectionQueue = (generation: number): void => {
    if (queuedProjectionGeneration !== generation) return
    if (projectionFlushTimer !== null) clearTimeout(projectionFlushTimer)
    projectionFlushRevision += 1
    projectionFlushTimer = null
    const projectionEvents = queuedProjectionEvents
    const recoveryRequired = queuedRecoveryRequired
    queuedProjectionEvents = []
    queuedProjectionGeneration = null
    queuedRecoveryRequired = false
    queuedRealtimeCheckpoint = null
    if (!isCurrent(generation)) return

    const reducerStartedAt = performance.now()
    if (projectionEvents.length > 0) {
      sessionStore.applyRealtimeBatch(projectionEvents)
      for (const event of projectionEvents)
        approvalsStore.applyRealtimeEvent(event)
    }
    performanceDiagnostics.record({
      metric: ClientPerformanceMetric.ReducerDurationMilliseconds,
      observation: ClientPerformanceObservation.Observed,
      value: performance.now() - reducerStartedAt,
    })
    if (recoveryRequired) {
      performanceDiagnostics.record({
        metric: ClientPerformanceMetric.CursorGap,
        observation: ClientPerformanceObservation.Detected,
        value: 1,
      })
      if (authorityRecoveryV2Enabled()) realtimeStore.beginResync()
      void refreshAuthority(generation)
    }
  }

  const queueProjectionEvents = (
    events: readonly CodexRealtimeEvent[],
    generation: number,
    recoveryRequired: boolean,
    flushImmediately: boolean,
  ): void => {
    if (
      queuedProjectionGeneration !== null &&
      queuedProjectionGeneration !== generation
    )
      clearProjectionQueue()
    queuedProjectionGeneration = generation
    queuedProjectionEvents.push(...events)
    queuedRecoveryRequired ||= recoveryRequired
    if (
      flushImmediately ||
      queuedRecoveryRequired ||
      sessionStore.snapshotRecoveryInFlight
    ) {
      flushProjectionQueue(generation)
      return
    }
    if (projectionFlushTimer !== null) return
    const flushRevision = ++projectionFlushRevision
    projectionFlushTimer = setTimeout(() => {
      if (flushRevision !== projectionFlushRevision) return
      projectionFlushTimer = null
      flushProjectionQueue(generation)
    }, NORMAL_EVENT_FRAME_WINDOW_MS)
  }

  // A pending frame must enter the recovery buffer before the snapshot can
  // return. This setup-scoped watcher is disposed with the controller.
  watch(
    () => sessionStore.snapshotRecoveryInFlight,
    (recovering) => {
      if (recovering && queuedProjectionGeneration !== null) {
        flushProjectionQueue(queuedProjectionGeneration)
      }
    },
    { flush: 'sync' },
  )

  watch(
    () => [sessionStore.selectedHostId, sessionStore.selectedThreadId],
    () => {
      recoveryController?.abort()
      recoveryGeneration = null
      if (recoveryTimer) clearTimeout(recoveryTimer)
      recoveryTimer = null
      realtimeStore.historyStatus = 'idle'
      if (realtimeStore.channelReady)
        void refreshAuthority(controllerGeneration)
    },
  )

  const recoverAuthentication = async (): Promise<
    'success' | 'retry' | 'terminal'
  > => {
    if (!authRecoveryInFlight) {
      authRecoveryInFlight = authStore
        .refresh()
        .then((refreshed): 'success' | 'retry' =>
          refreshed ? 'success' : 'retry',
        )
        .catch((error): 'retry' | 'terminal' =>
          isRetriableRealtimeError(error) || authStore.accessToken
            ? 'retry'
            : 'terminal',
        )
        .finally(() => {
          authRecoveryInFlight = null
        })
    }
    return authRecoveryInFlight
  }

  const scheduleReconnect = (
    generation: number,
    observation: ClientPerformanceObservation,
  ): void => {
    if (!isCurrent(generation) || !protocolCompatible || reconnectTimer) return
    performanceDiagnostics.record({
      metric: ClientPerformanceMetric.ReconnectAttempt,
      observation,
      value: 1,
    })
    transportRecoveryStartedAt ??= performance.now()
    const delay = calculateCodexReconnectDelay(realtimeStore.reconnectAttempt)
    realtimeStore.reconnectAttempt += 1
    realtimeStore.markConnecting(true)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      if (isCurrent(generation)) void connect()
    }, delay)
  }

  const acceptMessage = (
    message: MessageEvent<string>,
    generation: number,
    socketRef: WebSocket,
  ): void => {
    if (!isCurrent(generation)) return
    resetIdleTimer(generation, socketRef)
    try {
      const payload: unknown = JSON.parse(message.data)
      const batch =
        typeof payload === 'object' && payload !== null && 'events' in payload
          ? validateCodexRealtimeBatch(payload)
          : null
      const events = batch?.events ?? [validateCodexRealtimeEvent(payload)]
      if (batch !== null) {
        performanceDiagnostics.record({
          metric: ClientPerformanceMetric.RealtimeBatchEventCount,
          observation: batch.barrier
            ? ClientPerformanceObservation.BarrierBatch
            : ClientPerformanceObservation.NormalBatch,
          value: events.length,
        })
        performanceDiagnostics.record({
          metric: ClientPerformanceMetric.RealtimeBatchBytes,
          observation: batch.barrier
            ? ClientPerformanceObservation.BarrierBatch
            : ClientPerformanceObservation.NormalBatch,
          value: new TextEncoder().encode(message.data).byteLength,
        })
      }
      applyRealtimeEvents(
        events,
        generation,
        batch?.barrier === true || events.some(isRealtimeBarrierEvent),
      )
    } catch (error) {
      protocolCompatible = false
      const messageText =
        error instanceof CodexRealtimeContractError
          ? error.message
          : 'Codex实时事件不是有效JSON。'
      realtimeStore.markError(messageText, true)
      socketRef.close(PROTOCOL_CLOSE_CODE, 'Codex实时协议不兼容。')
    }
  }

  const applyRealtimeEvents = (
    events: readonly ReturnType<typeof validateCodexRealtimeEvent>[],
    generation: number,
    flushImmediately: boolean,
  ): void => {
    if (!isCurrent(generation)) return
    if (
      queuedProjectionGeneration !== null &&
      queuedProjectionGeneration !== generation
    ) {
      clearProjectionQueue()
    }
    if (queuedProjectionGeneration === null) {
      // Cursor and de-duplication state is tentatively advanced while events
      // wait for the frame flush. A dropped queue must roll back to this
      // checkpoint so reconnect resumes from the last projected cursor.
      queuedRealtimeCheckpoint = realtimeStore.captureCheckpoint()
    }
    const projectionEvents: ReturnType<typeof validateCodexRealtimeEvent>[] = []
    let recoveryRequired = false
    for (const event of events) {
      if (event.detail.kind === CodexRealtimeEventType.ConnectionReady) {
        if (transportRecoveryStartedAt !== null) {
          performanceDiagnostics.record({
            metric: ClientPerformanceMetric.ConnectionRecoveryMilliseconds,
            observation: ClientPerformanceObservation.Observed,
            value: performance.now() - transportRecoveryStartedAt,
          })
          transportRecoveryStartedAt = null
        }
        if (attemptTimer) clearTimeout(attemptTimer)
        attemptTimer = null
        // A ready channel does not prove the current task/approval projection is fresh.
        recoveryRequired = true
      }
      const hadStreamEpoch = realtimeStore.streamEpoch !== null
      const result = realtimeStore.acceptEvent(event)
      if (
        result === CodexRealtimeApplyResult.Applied ||
        result === CodexRealtimeApplyResult.NewStreamEpoch
      ) {
        projectionEvents.push(event)
      }
      if (
        result === CodexRealtimeApplyResult.Gap ||
        (result === CodexRealtimeApplyResult.NewStreamEpoch && hadStreamEpoch)
      ) {
        recoveryRequired = true
      }
    }
    queueProjectionEvents(
      projectionEvents,
      generation,
      recoveryRequired,
      flushImmediately,
    )
  }

  const connectAttempt = async (): Promise<void> => {
    const lifecycleGeneration = controllerGeneration
    await experienceFlags.load()
    if (
      manuallyClosed ||
      lifecycleGeneration !== controllerGeneration ||
      !runtimeConfig.public.codexFeatureEnabled ||
      socket
    ) {
      return
    }
    const generation = ++controllerGeneration
    protocolCompatible = true
    if (!navigator.onLine) {
      realtimeStore.markOffline()
      return
    }
    realtimeStore.markConnecting(realtimeStore.reconnectAttempt > 0)
    ticketController = new AbortController()
    attemptTimer = setTimeout(() => {
      if (!isCurrent(generation)) return
      const expiredSocket = invalidateConnectionAttempt()
      expiredSocket?.close(OFFLINE_CLOSE_CODE, '连接服务超时。')
      realtimeStore.markError('连接服务超时，正在重新连接。')
      scheduleReconnect(
        controllerGeneration,
        ClientPerformanceObservation.RetryTimer,
      )
    }, CONNECTION_ATTEMPT_TIMEOUT_MS)
    try {
      const ticket = await createCodexRealtimeClient().issueTicket(
        ticketController.signal,
      )
      if (!isCurrent(generation)) return
      const url = resolveCodexWebSocketUrl({
        pageUrl: window.location.href,
        apiBaseUrl: String(runtimeConfig.public.apiBaseURL || ''),
        configuredWsBaseUrl: String(runtimeConfig.public.codexWsBaseUrl || ''),
        realtimePath: String(
          runtimeConfig.public.codexRealtimePath || '/codex/events',
        ),
        ticket: ticket.ticket,
        cursor: realtimeStore.lastCursor,
        streamEpoch: realtimeStore.streamEpoch,
        batchVersion: experienceFlags.isEnabled('codex_realtime_batch_v2')
          ? 2
          : 1,
      })
      const socketRef = new WebSocket(url)
      socket = socketRef
      socketRef.addEventListener('open', () => {
        if (!isCurrent(generation)) return
        resetIdleTimer(generation, socketRef)
      })
      socketRef.addEventListener('message', (message) =>
        acceptMessage(message as MessageEvent<string>, generation, socketRef),
      )
      socketRef.addEventListener('close', (event) => {
        if (!isCurrent(generation)) return
        realtimeStore.recordClose({
          code: event.code,
          wasClean: event.wasClean,
          reason: event.reason || null,
        })
        socket = null
        if (attemptTimer) clearTimeout(attemptTimer)
        attemptTimer = null
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = null
        if (protocolCompatible) {
          scheduleReconnect(
            generation,
            ClientPerformanceObservation.SocketClosed,
          )
        }
      })
      socketRef.addEventListener('error', () => {
        if (isCurrent(generation))
          realtimeStore.markError('Codex实时连接发生网络错误。')
      })
    } catch (error) {
      if (!isCurrent(generation)) return
      if (attemptTimer) clearTimeout(attemptTimer)
      attemptTimer = null
      socket = null
      const normalized = normalizeApiError(error)
      if (normalized.statusCode === 401) {
        const recovery = await recoverAuthentication()
        if (!isCurrent(generation)) return
        if (recovery === 'retry') {
          realtimeStore.markError('认证服务暂不可用，正在恢复连接。')
          scheduleReconnect(generation, ClientPerformanceObservation.RetryTimer)
          return
        }
        if (recovery === 'success') {
          if (isCurrent(generation))
            reconnectAfterAttemptGeneration = generation
          return
        }
        authStore.clearSession()
        sessionStore.clearSession()
        approvalsStore.clear()
        realtimeStore.markAuthBlocked('登录状态已失效，请重新登录后继续。')
        performanceDiagnostics.record({
          metric: ClientPerformanceMetric.AuthTerminal,
          observation: ClientPerformanceObservation.Terminal,
          value: 1,
        })
        return
      }
      realtimeStore.markError(realtimeErrorMessage(normalized))
      if (isRetriableRealtimeError(error)) {
        scheduleReconnect(generation, ClientPerformanceObservation.RetryTimer)
      }
    }
  }

  const connect = (): Promise<void> => {
    if (manuallyClosed) return Promise.resolve()
    if (connectInFlight) return connectInFlight
    const attempt = connectAttempt()
    const settled = attempt.finally(() => {
      // Compare against the promise returned by finally; comparing with the
      // original attempt leaves the completed promise cached forever.
      if (connectInFlight !== settled) return
      connectInFlight = null
      if (
        reconnectAfterAttemptGeneration === controllerGeneration &&
        !manuallyClosed &&
        !socket
      ) {
        reconnectAfterAttemptGeneration = null
        void connect()
      }
    })
    connectInFlight = settled
    return settled
  }

  const disconnect = (): void => {
    manuallyClosed = true
    const previousSocket = invalidateConnectionAttempt()
    previousSocket?.close(NORMAL_CLOSE_CODE, 'Codex页面已离开。')
    realtimeStore.clearRealtime()
    approvalsStore.clear()
  }

  const handleOnline = (): void => {
    performanceDiagnostics.record({
      metric: ClientPerformanceMetric.ReconnectAttempt,
      observation: ClientPerformanceObservation.NetworkOnline,
      value: 1,
    })
    void connect()
  }
  const handleOffline = (): void => {
    const previousSocket = invalidateConnectionAttempt()
    previousSocket?.close(OFFLINE_CLOSE_CODE, '浏览器已离线。')
    realtimeStore.markOffline()
  }
  const handleVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible') return
    const lastActivity =
      realtimeStore.lastMessageAt ?? realtimeStore.connectedAt
    if (
      socket &&
      lastActivity !== null &&
      Date.now() - lastActivity >= DEFAULT_IDLE_TIMEOUT_MS
    ) {
      const staleSocket = invalidateConnectionAttempt()
      staleSocket?.close(
        OFFLINE_CLOSE_CODE,
        '实时连接长时间无响应，恢复后重新核对。',
      )
    }
    if (!socket) {
      performanceDiagnostics.record({
        metric: ClientPerformanceMetric.ReconnectAttempt,
        observation: ClientPerformanceObservation.VisibilityResume,
        value: 1,
      })
      void connect()
    }
  }
  /** 网络质量变化只触发新鲜度检查，健康连接继续使用。 */
  const handleNetworkInformationChange = (): void => {
    if (!navigator.onLine) return
    handleVisibilityChange()
  }

  onMounted(() => {
    manuallyClosed = false
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    networkInformation = readCodexNetworkInformation()
    networkInformation?.addEventListener(
      'change',
      handleNetworkInformationChange,
    )
    void connect()
  })

  onScopeDispose(() => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    networkInformation?.removeEventListener(
      'change',
      handleNetworkInformationChange,
    )
    networkInformation = null
    disconnect()
  })

  return { connect, disconnect }
}
