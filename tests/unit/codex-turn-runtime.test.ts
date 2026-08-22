import { describe, expect, it } from 'vitest'
import {
  CodexTurnPhase,
  type CodexTurnRuntime,
} from '../../app/types/codex-turn'
import { isCodexTurnRuntimeStalled } from '../../app/utils/codex-turn-runtime'

const runtime = (phase: CodexTurnPhase): CodexTurnRuntime => ({
  turn_id: 'turn-1',
  thread_id: 'thread-1',
  phase,
  last_activity_at: '2026-08-19T00:00:00Z',
  stalled_reason: null,
  lease_generation: 1,
  lease_expires_at: null,
})

describe('Codex turn runtime authority', () => {
  it('only treats the server stalled phase as stalled', () => {
    expect(isCodexTurnRuntimeStalled(runtime(CodexTurnPhase.Stalled))).toBe(
      true,
    )
    expect(isCodexTurnRuntimeStalled(runtime(CodexTurnPhase.Running))).toBe(
      false,
    )
  })

  it('does not infer a stalled state from missing runtime metadata', () => {
    expect(isCodexTurnRuntimeStalled(null)).toBe(false)
    expect(isCodexTurnRuntimeStalled(undefined)).toBe(false)
  })
})
