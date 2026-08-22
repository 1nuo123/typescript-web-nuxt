import { readonly } from 'vue'
import {
  CODEX_EXPERIENCE_FEATURE_FLAG_DEFAULTS,
  type CodexExperienceFeatureFlags,
} from '~/types/codex-feature-flags'
import { createCodexFeatureFlagsClient } from '~/services/api/codex-feature-flags'

type CodexExperienceFeatureFlagName = keyof CodexExperienceFeatureFlags

export const CODEX_EXPERIENCE_FEATURE_FLAGS_STATE_KEY =
  'codex-experience-feature-flags'
export const CODEX_EXPERIENCE_FEATURE_FLAGS_LOADED_STATE_KEY =
  'codex-experience-feature-flags-loaded'

let loadInFlight: Promise<void> | null = null

const isCodexExperienceFeatureFlags = (
  value: unknown,
): value is CodexExperienceFeatureFlags => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.codex_scroll_controller_v2 === 'boolean' &&
    typeof candidate.codex_realtime_batch_v2 === 'boolean' &&
    typeof candidate.codex_authority_recovery_v2 === 'boolean'
  )
}

/** 读取服务端批准的体验开关；请求失败时保持全量 legacy，避免客户端越权启用。 */
export const useCodexExperienceFeatureFlags = () => {
  const flags = useState<CodexExperienceFeatureFlags>(
    CODEX_EXPERIENCE_FEATURE_FLAGS_STATE_KEY,
    () => ({ ...CODEX_EXPERIENCE_FEATURE_FLAG_DEFAULTS }),
  )
  const loaded = useState(
    CODEX_EXPERIENCE_FEATURE_FLAGS_LOADED_STATE_KEY,
    () => false,
  )

  const load = async (): Promise<void> => {
    if (loaded.value) return
    if (loadInFlight) return loadInFlight
    loadInFlight = (async () => {
      try {
        const response = await createCodexFeatureFlagsClient().read()
        if (!isCodexExperienceFeatureFlags(response)) return
        flags.value = response
        loaded.value = true
      } catch {
        flags.value = { ...CODEX_EXPERIENCE_FEATURE_FLAG_DEFAULTS }
      } finally {
        loadInFlight = null
      }
    })()
    return loadInFlight
  }

  const isEnabled = (name: CodexExperienceFeatureFlagName): boolean =>
    flags.value[name]
  const reset = (): void => {
    flags.value = { ...CODEX_EXPERIENCE_FEATURE_FLAG_DEFAULTS }
    loaded.value = false
  }

  return {
    flags: readonly(flags),
    loaded: readonly(loaded),
    load,
    reset,
    isEnabled,
  }
}
