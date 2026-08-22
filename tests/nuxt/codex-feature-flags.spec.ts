import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthSessionStatus } from '~/types/auth'
import {
  CODEX_EXPERIENCE_FEATURE_FLAGS_LOADED_STATE_KEY,
  CODEX_EXPERIENCE_FEATURE_FLAGS_STATE_KEY,
  useCodexExperienceFeatureFlags,
} from '~/composables/useCodexExperienceFeatureFlags'
import { CODEX_FEATURE_FLAGS_PATH } from '~/services/api/codex-feature-flags'
import {
  CODEX_EXPERIENCE_FEATURE_FLAG_DEFAULTS,
  type CodexExperienceFeatureFlags,
} from '~/types/codex-feature-flags'

const envelope = <T>(data: T) => ({
  header: {
    code: 'system.success.ok',
    message: 'ok',
    request_id: 'request-1',
  },
  data,
})

const resetFeatureFlags = (): void => {
  useState<CodexExperienceFeatureFlags>(
    CODEX_EXPERIENCE_FEATURE_FLAGS_STATE_KEY,
  ).value = { ...CODEX_EXPERIENCE_FEATURE_FLAG_DEFAULTS }
  useState<boolean>(CODEX_EXPERIENCE_FEATURE_FLAGS_LOADED_STATE_KEY).value =
    false
}

const authorize = (): void => {
  const authStore = useAuthStore()
  authStore.status = AuthSessionStatus.Authenticated
  authStore.accessToken = 'access-token'
}

describe('Codex authoritative experience feature flags', () => {
  afterEach(() => {
    resetFeatureFlags()
    useAuthStore().$reset()
    vi.unstubAllGlobals()
  })

  it('uses the authenticated server response instead of public runtime values', async () => {
    const serverFlags: CodexExperienceFeatureFlags = {
      codex_scroll_controller_v2: true,
      codex_realtime_batch_v2: true,
      codex_authority_recovery_v2: false,
    }
    const fetchMock = vi.fn().mockResolvedValue(envelope(serverFlags))
    vi.stubGlobal('$fetch', fetchMock)
    authorize()

    const featureFlags = useCodexExperienceFeatureFlags()
    await featureFlags.load()

    expect(featureFlags.flags.value).toEqual(serverFlags)
    expect(featureFlags.loaded.value).toBe(true)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(CODEX_FEATURE_FLAGS_PATH)
    const options = fetchMock.mock.calls[0]?.[1] as { headers: Headers }
    expect(options.headers.get('Authorization')).toBe('Bearer access-token')
  })

  it('fails closed for malformed responses and permits a later retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(envelope({ codex_realtime_batch_v2: true }))
      .mockResolvedValueOnce(
        envelope({
          codex_scroll_controller_v2: false,
          codex_realtime_batch_v2: false,
          codex_authority_recovery_v2: true,
        } satisfies CodexExperienceFeatureFlags),
      )
    vi.stubGlobal('$fetch', fetchMock)
    authorize()

    const featureFlags = useCodexExperienceFeatureFlags()
    await featureFlags.load()

    expect(featureFlags.flags.value).toEqual(
      CODEX_EXPERIENCE_FEATURE_FLAG_DEFAULTS,
    )
    expect(featureFlags.loaded.value).toBe(false)

    await featureFlags.load()

    expect(featureFlags.flags.value).toEqual({
      codex_scroll_controller_v2: false,
      codex_realtime_batch_v2: false,
      codex_authority_recovery_v2: true,
    })
    expect(featureFlags.loaded.value).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
