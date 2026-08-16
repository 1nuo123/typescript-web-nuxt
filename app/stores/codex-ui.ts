import { defineStore } from 'pinia'

export enum CodexContextView {
  Changes = 'changes',
  Output = 'output',
  Approvals = 'approvals',
}

const CODEX_DRAFT_RETENTION_LIMIT = 24

interface CodexUiStoreState {
  draftsByThreadId: Record<string, string>
  mobilePanelOpen: boolean
  timelineFollowByThreadId: Record<string, boolean>
  timelineScrollTopByThreadId: Record<string, number>
  contextPanelOpen: boolean
  contextView: CodexContextView
  selectedContextItemId: string | null
}

export const useCodexUiStore = defineStore('codex-ui', {
  state: (): CodexUiStoreState => ({
    draftsByThreadId: {},
    mobilePanelOpen: false,
    timelineFollowByThreadId: {},
    timelineScrollTopByThreadId: {},
    contextPanelOpen: false,
    contextView: CodexContextView.Changes,
    selectedContextItemId: null,
  }),
  actions: {
    setDraft(threadId: string, draft: string): void {
      this.draftsByThreadId[threadId] = draft
      const retainedEntries = Object.entries(this.draftsByThreadId).slice(
        -CODEX_DRAFT_RETENTION_LIMIT,
      )
      this.draftsByThreadId = Object.fromEntries(retainedEntries)
    },
    clearDraft(threadId: string): void {
      this.draftsByThreadId = Object.fromEntries(
        Object.entries(this.draftsByThreadId).filter(
          ([candidateThreadId]) => candidateThreadId !== threadId,
        ),
      )
    },
    setTimelinePosition(
      threadId: string,
      follow: boolean,
      scrollTop: number,
    ): void {
      this.timelineFollowByThreadId[threadId] = follow
      this.timelineScrollTopByThreadId[threadId] = scrollTop
    },
    openContext(
      view: CodexContextView,
      selectedItemId: string | null = null,
    ): void {
      this.contextView = view
      this.selectedContextItemId = selectedItemId
      this.contextPanelOpen = true
    },
    selectContext(
      view: CodexContextView,
      selectedItemId: string | null = null,
    ): void {
      this.contextView = view
      this.selectedContextItemId = selectedItemId
    },
    closeContext(): void {
      this.contextPanelOpen = false
      this.selectedContextItemId = null
    },
    clearTransientUi(): void {
      this.mobilePanelOpen = false
      this.contextPanelOpen = false
      this.selectedContextItemId = null
    },
    clearUi(): void {
      this.$reset()
    },
  },
})
