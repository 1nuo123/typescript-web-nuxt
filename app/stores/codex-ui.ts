import { defineStore } from 'pinia'

interface CodexUiStoreState {
  draftsByThreadId: Record<string, string>
  mobilePanelOpen: boolean
  autoFollowTimeline: boolean
}

export const useCodexUiStore = defineStore('codex-ui', {
  state: (): CodexUiStoreState => ({
    draftsByThreadId: {},
    mobilePanelOpen: false,
    autoFollowTimeline: true,
  }),
  actions: {
    setDraft(threadId: string, draft: string): void {
      this.draftsByThreadId[threadId] = draft
    },
    clearDraft(threadId: string): void {
      this.draftsByThreadId = Object.fromEntries(
        Object.entries(this.draftsByThreadId).filter(
          ([candidateThreadId]) => candidateThreadId !== threadId,
        ),
      )
    },
    clearUi(): void {
      this.$reset()
    },
  },
})
