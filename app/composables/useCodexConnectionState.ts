import { storeToRefs } from 'pinia'

export const useCodexConnectionState = () => {
  const realtimeStore = useCodexRealtimeStore()
  const { status, gapDetected, lastError, reconnectAttempt } =
    storeToRefs(realtimeStore)

  return {
    status,
    gapDetected,
    lastError,
    reconnectAttempt,
  }
}
