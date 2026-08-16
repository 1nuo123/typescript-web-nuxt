import { defineStore } from 'pinia'
import {
  CodexRealtimeApplyResult,
  CodexRealtimeConnectionStatus,
  CodexRealtimeEventType,
  type CodexRealtimeEvent,
} from '~/types/codex-realtime'

const MAX_REMEMBERED_EVENT_IDS = 2_000

interface CodexRealtimeStoreState {
  status: CodexRealtimeConnectionStatus
  streamEpoch: string | null
  lastCursor: string | null
  seenEventIds: string[]
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
    gapDetected: false,
    reconnectAttempt: 0,
    lastError: null,
    lastMessageAt: null,
  }),
  actions: {
    acceptEvent(event: CodexRealtimeEvent): CodexRealtimeApplyResult {
      if (this.seenEventIds.includes(event.header.event_id)) {
        return CodexRealtimeApplyResult.Duplicate
      }
      const isNewEpoch = this.streamEpoch !== event.header.stream_epoch
      if (isNewEpoch) {
        this.streamEpoch = event.header.stream_epoch
        this.lastCursor = null
        this.seenEventIds = []
        this.gapDetected = false
      }
      if (event.header.cursor) this.lastCursor = event.header.cursor
      this.lastMessageAt = Date.now()
      this.seenEventIds.push(event.header.event_id)
      if (this.seenEventIds.length > MAX_REMEMBERED_EVENT_IDS) {
        this.seenEventIds.splice(
          0,
          this.seenEventIds.length - MAX_REMEMBERED_EVENT_IDS,
        )
      }
      if (event.detail.kind === CodexRealtimeEventType.StreamGapDetected) {
        this.gapDetected = true
        this.lastCursor = null
        return CodexRealtimeApplyResult.Gap
      }
      if (event.detail.kind === CodexRealtimeEventType.ConnectionReady) {
        this.status = CodexRealtimeConnectionStatus.Connected
        this.reconnectAttempt = 0
        this.lastError = null
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

    markOffline(): void {
      this.status = CodexRealtimeConnectionStatus.Offline
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
