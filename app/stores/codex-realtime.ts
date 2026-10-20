import { defineStore } from 'pinia'
import {
  CodexRealtimeApplyResult,
  CodexRealtimeConnectionStatus,
  CodexRealtimeEventType,
  type CodexRealtimeEvent,
} from '~/types/codex-realtime'

const MAX_REMEMBERED_EVENT_IDS = 2_000
const MAX_REMEMBERED_CURSORS = 2_000

interface CodexRealtimeStoreState {
  status: CodexRealtimeConnectionStatus
  streamEpoch: string | null
  lastCursor: string | null
  seenEventIds: string[]
  seenCursors: string[]
  gapDetected: boolean
  reconnectAttempt: number
  lastError: string | null
  lastMessageAt: number | null
  connectedAt: number | null
  channelReady: boolean
  lastClose: {
    code: number
    wasClean: boolean
    reason: string | null
    occurredAt: number
    durationMs: number | null
  } | null
}

export interface CodexRealtimeCheckpoint {
  streamEpoch: string | null
  lastCursor: string | null
  seenEventIds: string[]
  seenCursors: string[]
  gapDetected: boolean
  lastMessageAt: number | null
}

export const useCodexRealtimeStore = defineStore('codex-realtime', {
  state: (): CodexRealtimeStoreState => ({
    status: CodexRealtimeConnectionStatus.Idle,
    streamEpoch: null,
    lastCursor: null,
    seenEventIds: [],
    seenCursors: [],
    gapDetected: false,
    reconnectAttempt: 0,
    lastError: null,
    lastMessageAt: null,
    connectedAt: null,
    channelReady: false,
    lastClose: null,
  }),
  actions: {
    captureCheckpoint(): CodexRealtimeCheckpoint {
      return {
        streamEpoch: this.streamEpoch,
        lastCursor: this.lastCursor,
        seenEventIds: [...this.seenEventIds],
        seenCursors: [...this.seenCursors],
        gapDetected: this.gapDetected,
        lastMessageAt: this.lastMessageAt,
      }
    },

    restoreCheckpoint(checkpoint: CodexRealtimeCheckpoint): void {
      this.streamEpoch = checkpoint.streamEpoch
      this.lastCursor = checkpoint.lastCursor
      this.seenEventIds = [...checkpoint.seenEventIds]
      this.seenCursors = [...checkpoint.seenCursors]
      this.gapDetected = checkpoint.gapDetected
      this.lastMessageAt = checkpoint.lastMessageAt
    },

    acceptEvent(event: CodexRealtimeEvent): CodexRealtimeApplyResult {
      const cursor = event.header.cursor
      if (this.seenEventIds.includes(event.header.event_id)) {
        return CodexRealtimeApplyResult.Duplicate
      }
      const isNewEpoch = this.streamEpoch !== event.header.stream_epoch
      if (isNewEpoch) {
        this.streamEpoch = event.header.stream_epoch
        this.lastCursor = null
        this.seenEventIds = []
        this.seenCursors = []
        this.gapDetected = false
      }
      if (typeof cursor === 'string' && this.seenCursors.includes(cursor)) {
        return CodexRealtimeApplyResult.Duplicate
      }
      if (cursor) this.lastCursor = cursor
      this.lastMessageAt = Date.now()
      this.seenEventIds.push(event.header.event_id)
      if (this.seenEventIds.length > MAX_REMEMBERED_EVENT_IDS) {
        this.seenEventIds.splice(
          0,
          this.seenEventIds.length - MAX_REMEMBERED_EVENT_IDS,
        )
      }
      if (typeof cursor === 'string') {
        this.seenCursors.push(cursor)
        if (this.seenCursors.length > MAX_REMEMBERED_CURSORS) {
          this.seenCursors.splice(
            0,
            this.seenCursors.length - MAX_REMEMBERED_CURSORS,
          )
        }
      }
      if (event.detail.kind === CodexRealtimeEventType.StreamGapDetected) {
        this.gapDetected = true
        this.lastCursor = null
        return CodexRealtimeApplyResult.Gap
      }
      if (event.detail.kind === CodexRealtimeEventType.ConnectionReady) {
        this.markConnected()
      } else if (
        event.detail.kind === CodexRealtimeEventType.ConnectionHeartbeat &&
        this.connectedAt !== null &&
        Date.now() > this.connectedAt
      ) {
        // 应用ready之后收到服务端心跳才确认健康，握手即断不会重置退避。
        this.reconnectAttempt = 0
      }
      return isNewEpoch
        ? CodexRealtimeApplyResult.NewStreamEpoch
        : CodexRealtimeApplyResult.Applied
    },

    markConnecting(reconnecting = false): void {
      this.channelReady = false
      this.status = reconnecting
        ? CodexRealtimeConnectionStatus.Reconnecting
        : CodexRealtimeConnectionStatus.Connecting
    },

    markConnected(): void {
      this.channelReady = true
      this.status = this.gapDetected
        ? CodexRealtimeConnectionStatus.Resyncing
        : CodexRealtimeConnectionStatus.Connected
      this.lastError = null
      this.connectedAt ??= Date.now()
    },

    recordClose(close: {
      code: number
      wasClean: boolean
      reason?: string | null
    }): void {
      const occurredAt = Date.now()
      this.lastClose = {
        code: close.code,
        wasClean: close.wasClean,
        reason:
          typeof close.reason === 'string'
            ? close.reason.slice(0, 120) || null
            : null,
        occurredAt,
        durationMs:
          this.connectedAt === null
            ? null
            : Math.max(0, occurredAt - this.connectedAt),
      }
      this.connectedAt = null
    },

    markOffline(): void {
      this.status = CodexRealtimeConnectionStatus.Offline
    },

    beginResync(): void {
      this.status = CodexRealtimeConnectionStatus.Resyncing
      this.gapDetected = true
    },

    finishResync(): void {
      this.status = this.channelReady
        ? CodexRealtimeConnectionStatus.Connected
        : CodexRealtimeConnectionStatus.Connecting
      this.gapDetected = false
      this.lastError = null
    },

    markAuthBlocked(message: string): void {
      this.lastError = message
      this.status = CodexRealtimeConnectionStatus.AuthBlocked
    },

    markError(message: string, incompatible = false): void {
      this.lastError = message
      this.status = incompatible
        ? CodexRealtimeConnectionStatus.Incompatible
        : CodexRealtimeConnectionStatus.Error
    },

    clearRealtime(): void {
      this.$reset()
    },
  },
})
