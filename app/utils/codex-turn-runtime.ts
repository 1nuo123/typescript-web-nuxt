import { CodexTurnPhase, type CodexTurnRuntime } from '../types/codex-turn'

/** 仅按服务端权威 phase 判断停滞，客户端时间和 socket 到达时间不得参与推断。 */
export const isCodexTurnRuntimeStalled = (
  runtime: CodexTurnRuntime | null | undefined,
): boolean => runtime?.phase === CodexTurnPhase.Stalled
