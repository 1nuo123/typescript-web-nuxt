import type { components } from './generated/codex-content'

export type CodexReadableContent =
  components['schemas']['ReadableContentDescriptor'] & {
    availability: 'readable'
  }
export type CodexContentDescriptor =
  | CodexReadableContent
  | (components['schemas']['InlineContentDescriptor'] & {
      availability: 'inline'
    })
  | (components['schemas']['UnavailableContentDescriptor'] & {
      availability: 'unavailable'
    })
export type CodexContentChunk = components['schemas']['CodexContentChunk']
export type CodexContentReadRequest =
  components['schemas']['CodexContentReadRequest']
