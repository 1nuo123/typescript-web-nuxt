import { defineStore } from 'pinia'
import type { ThemePreference } from '~/types/app'

interface AppStoreState {
  theme: ThemePreference
  sidebarOpen: boolean
}

export const useAppStore = defineStore('app', {
  state: (): AppStoreState => ({
    theme: 'system',
    sidebarOpen: false,
  }),
  actions: {
    setTheme(theme: ThemePreference) {
      this.theme = theme
    },
    toggleSidebar() {
      this.sidebarOpen = !this.sidebarOpen
    },
    closeSidebar() {
      this.sidebarOpen = false
    },
  },
})
