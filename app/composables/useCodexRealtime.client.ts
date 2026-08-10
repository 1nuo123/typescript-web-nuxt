import { CodexRealtimeApplyResult } from '~/types/codex-realtime'
import {
  CodexRealtimeContractError,
  validateCodexRealtimeEvent,
} from '~/utils/codex-event-validator'

const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000]
const RECONNECT_JITTER_RATIO = 0.2
const DEFAULT_IDLE_TIMEOUT_MS = 90_000
const NORMAL_CLOSE_CODE = 1_000
const OFFLINE_CLOSE_CODE = 4_001
const PROTOCOL_CLOSE_CODE = 4_002

export interface CodexWebSocketUrlInput {
  pageUrl: string
  apiBaseUrl: string
  configuredWsBaseUrl: string
  realtimePath: string
  ticket: string
  cursor?: string | null
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
  return resolved.toString()
}

export const useCodexRealtime = () => {
  const runtimeConfig = useRuntimeConfig()
  const realtimeStore = useCodexRealtimeStore()
  const sessionStore = useCodexSessionStore()
  const approvalsStore = useCodexApprovalsStore()
  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let manuallyClosed = false
  let protocolCompatible = true

  const clearTimers = (): void => {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    if (idleTimer) clearTimeout(idleTimer)
    reconnectTimer = null
    idleTimer = null
  }

  const resetIdleTimer = (): void => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      socket?.close(OFFLINE_CLOSE_CODE, 'Codex实时连接空闲超时。')
    }, DEFAULT_IDLE_TIMEOUT_MS)
  }

  const refreshAuthority = async (): Promise<void> => {
    try {
      await sessionStore.refreshAuthority()
    } catch {
      realtimeStore.markError('Codex权威状态刷新失败。')
    }
  }

  const scheduleReconnect = (): void => {
    if (manuallyClosed || !protocolCompatible || reconnectTimer) return
    const delay = calculateCodexReconnectDelay(realtimeStore.reconnectAttempt)
    realtimeStore.reconnectAttempt += 1
    realtimeStore.markConnecting(true)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      void connect()
    }, delay)
  }

  const acceptMessage = (message: MessageEvent<string>): void => {
    resetIdleTimer()
    try {
      const event = validateCodexRealtimeEvent(JSON.parse(message.data))
      const result = realtimeStore.acceptEvent(event)
      if (
        result === CodexRealtimeApplyResult.Applied ||
        result === CodexRealtimeApplyResult.NewStreamEpoch
      ) {
        sessionStore.applyRealtimeEvent(event)
        approvalsStore.applyRealtimeEvent(event)
      }
      if (
        result === CodexRealtimeApplyResult.Gap ||
        result === CodexRealtimeApplyResult.NewStreamEpoch
      ) {
        void refreshAuthority()
      }
    } catch (error) {
      protocolCompatible = false
      const messageText =
        error instanceof CodexRealtimeContractError
          ? error.message
          : 'Codex实时事件不是有效JSON。'
      realtimeStore.markError(messageText, true)
      socket?.close(PROTOCOL_CLOSE_CODE, 'Codex实时协议不兼容。')
    }
  }

  const connect = async (): Promise<void> => {
    if (!runtimeConfig.public.codexFeatureEnabled || socket) return
    manuallyClosed = false
    protocolCompatible = true
    if (!navigator.onLine) {
      realtimeStore.markOffline()
      return
    }
    realtimeStore.markConnecting(realtimeStore.reconnectAttempt > 0)
    try {
      const ticket = await createCodexRealtimeClient().issueTicket()
      const url = resolveCodexWebSocketUrl({
        pageUrl: window.location.href,
        apiBaseUrl: String(runtimeConfig.public.apiBaseURL || ''),
        configuredWsBaseUrl: String(runtimeConfig.public.codexWsBaseUrl || ''),
        realtimePath: String(
          runtimeConfig.public.codexRealtimePath || '/codex/events',
        ),
        ticket: ticket.ticket,
        cursor: realtimeStore.lastCursor,
      })
      socket = new WebSocket(url)
      socket.addEventListener('open', resetIdleTimer)
      socket.addEventListener('message', acceptMessage as EventListener)
      socket.addEventListener('close', () => {
        socket = null
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = null
        if (!manuallyClosed && protocolCompatible) scheduleReconnect()
      })
      socket.addEventListener('error', () => {
        realtimeStore.markError('Codex实时连接发生网络错误。')
      })
    } catch {
      socket = null
      realtimeStore.markError('Codex实时票据或连接创建失败。')
      scheduleReconnect()
    }
  }

  const disconnect = (): void => {
    manuallyClosed = true
    clearTimers()
    socket?.close(NORMAL_CLOSE_CODE, 'Codex页面已离开。')
    socket = null
    realtimeStore.clearRealtime()
    approvalsStore.clear()
  }

  const handleOnline = (): void => {
    void connect()
  }
  const handleOffline = (): void => {
    socket?.close(OFFLINE_CLOSE_CODE, '浏览器已离线。')
    realtimeStore.markOffline()
  }
  const handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible' && !socket) void connect()
  }

  onMounted(() => {
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    void connect()
  })

  onScopeDispose(() => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    disconnect()
  })

  return { connect, disconnect }
}
