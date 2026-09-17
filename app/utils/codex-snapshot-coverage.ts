import { CodexThreadHistoryStatus } from '../types/codex-thread'
import { CodexTurnStatus } from '../types/codex-turn'
import type { CodexThreadSnapshotDetail } from '../types/codex-realtime'

export type CodexThreadSnapshotCoverage = Pick<
  CodexThreadSnapshotDetail,
  'thread' | 'turns' | 'items' | 'history_status' | 'history_has_more'
>

const TERMINAL_TURN_STATUSES = new Set<string>([
  CodexTurnStatus.Completed,
  CodexTurnStatus.Failed,
  CodexTurnStatus.Interrupted,
])

/**
 * Returns terminal turns whose complete item groups are present in this page.
 * A paged history can begin in the middle of its first turn, so that group is
 * excluded while later groups are safe to replace with snapshot authority.
 */
export const getFullyCoveredTerminalTurnIds = (
  snapshot: CodexThreadSnapshotCoverage,
): Set<string> => {
  if (snapshot.history_status !== CodexThreadHistoryStatus.Complete) {
    return new Set()
  }

  const representedTurnIds = new Set(
    snapshot.items
      .filter(
        (item) => item.header.thread_id === snapshot.thread.upstream_thread_id,
      )
      .map((item) => item.header.turn_id)
      .filter((turnId): turnId is string => turnId !== null),
  )

  if (snapshot.history_has_more) {
    const firstTurnId = snapshot.items[0]?.header.turn_id
    if (firstTurnId) representedTurnIds.delete(firstTurnId)
  }

  return new Set(
    snapshot.turns
      .filter(
        (turn) =>
          TERMINAL_TURN_STATUSES.has(turn.status) &&
          representedTurnIds.has(turn.turn_id),
      )
      .map((turn) => turn.turn_id),
  )
}
