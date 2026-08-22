import type { CodexExperienceFeatureFlags } from '~/types/codex-feature-flags'
import { createCodexApiClient } from './codex-api-client'

export const CODEX_FEATURE_FLAGS_PATH = '/codex/experience/feature-flags'

export const createCodexFeatureFlagsClient = () => {
  const client = createCodexApiClient()
  return {
    read: () =>
      client.get<CodexExperienceFeatureFlags>(CODEX_FEATURE_FLAGS_PATH),
  }
}
