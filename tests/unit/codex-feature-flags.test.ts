import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CODEX_CLIENT_DIAGNOSTICS_UPLOAD_DEFAULT_ENABLED,
  CODEX_EXPERIENCE_FEATURE_FLAG_DEFAULTS,
  type CodexExperienceFeatureFlags,
} from '../../app/types/codex-feature-flags'

const SHARED_FEATURE_FLAGS_FIXTURE_PATH = fileURLToPath(
  new URL(
    '../../../work/test/fixtures/codex_feature_flags_contract.json',
    import.meta.url,
  ),
)

/** 后端与浏览器共同读取的体验开关 fixture 结构。 */
interface CodexExperienceFeatureFlagsFixture {
  default_flags: CodexExperienceFeatureFlags
  server_approved_flags: CodexExperienceFeatureFlags
}

const sharedFixture = JSON.parse(
  readFileSync(SHARED_FEATURE_FLAGS_FIXTURE_PATH, 'utf8'),
) as CodexExperienceFeatureFlagsFixture

describe('Codex experience feature flags', () => {
  it('keeps every high-risk path independently disabled by default', () => {
    const defaults: CodexExperienceFeatureFlags =
      CODEX_EXPERIENCE_FEATURE_FLAG_DEFAULTS

    expect(defaults).toEqual(sharedFixture.default_flags)
    expect(Object.isFrozen(defaults)).toBe(true)
  })

  it('keeps the shared server-authoritative values assignable to the browser contract', () => {
    const approvedFlags: CodexExperienceFeatureFlags =
      sharedFixture.server_approved_flags

    expect(approvedFlags).toEqual({
      codex_scroll_controller_v2: true,
      codex_realtime_batch_v2: false,
      codex_authority_recovery_v2: true,
    })
  })
})

it('keeps browser diagnostic transport disabled by default', () => {
  expect(CODEX_CLIENT_DIAGNOSTICS_UPLOAD_DEFAULT_ENABLED).toBe(false)
})
