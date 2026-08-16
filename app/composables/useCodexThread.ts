import { storeToRefs } from 'pinia'

export const useCodexThread = () => {
  const sessionStore = useCodexSessionStore()
  const { selectedThread, selectedTimeline, selectedPendingTurn, lastError } =
    storeToRefs(sessionStore)

  return {
    selectedThread,
    selectedTimeline,
    pendingTurn: selectedPendingTurn,
    lastError,
    sendMessage: (message: string) => sessionStore.sendMessage(message),
    interruptTurn: () => sessionStore.interruptTurn(),
  }
}
