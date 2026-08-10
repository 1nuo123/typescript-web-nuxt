import { storeToRefs } from 'pinia'

export const useCodexThread = () => {
  const sessionStore = useCodexSessionStore()
  const { selectedThread, selectedTimeline, pendingOperation, lastError } =
    storeToRefs(sessionStore)

  return {
    selectedThread,
    selectedTimeline,
    pendingOperation,
    lastError,
    sendMessage: (message: string) => sessionStore.sendMessage(message),
    interruptTurn: () => sessionStore.interruptTurn(),
  }
}
