import type { InjectionKey } from 'vue'

/** Carries the owning layout's visual scope across Teleport boundaries. */
export const UI_SURFACE_CLASS: InjectionKey<string> = Symbol('ui-surface-class')
