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
  }),
  actions: {
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
      }
      return isNewEpoch
        ? CodexRealtimeApplyResult.NewStreamEpoch
        : CodexRealtimeApplyResult.Applied
    },

    markConnecting(reconnecting = false): void {
      this.status = reconnecting
        ? CodexRealtimeConnectionStatus.Reconnecting
        : CodexRealtimeConnectionStatus.Connecting
    },

    markConnected(): void {
      this.status = CodexRealtimeConnectionStatus.Connected
      this.reconnectAttempt = 0
      this.lastError = null
    },

    markOffline(): void {
      this.status = CodexRealtimeConnectionStatus.Offline
    },

    beginResync(): void {
      this.status = CodexRealtimeConnectionStatus.Resyncing
      this.gapDetected = true
    },

    finishResync(): void {
      this.status = CodexRealtimeConnectionStatus.Connected
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
