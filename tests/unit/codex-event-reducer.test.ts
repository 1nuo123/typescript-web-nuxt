import { describe, expect, it } from 'vitest'
import {
  CodexTimelineItemKind,
  CodexTimelineItemStatus,
} from '../../app/types/codex-item'
import { CodexThreadHistoryStatus } from '../../app/types/codex-thread'
import {
  CODEX_REALTIME_SCHEMA_VERSION,
  CODEX_REALTIME_STREAM_EPOCH,
  CodexRealtimeEventType,
  type CodexRealtimeEvent,
} from '../../app/types/codex-realtime'
import {
  createCodexSessionProjection,
  reduceCodexRealtimeEvent,
} from '../../app/utils/codex-event-reducer'
import {
  CODEX_CONTENT_TRUNCATED_NOTICE,
  CODEX_TIMELINE_TEXT_LIMIT,
} from '../../app/utils/codex-content'
import {
  CodexRealtimeContractError,
  validateCodexRealtimeEvent,
} from '../../app/utils/codex-event-validator'

const INCOMPATIBLE_CODEX_REALTIME_SCHEMA_VERSION = '1.0'

const event = <TType extends CodexRealtimeEventType>(
  type: TType,
  payload: Extract<CodexRealtimeEvent, { type: TType }>['payload'],
  seq = 0,
): Extract<CodexRealtimeEvent, { type: TType }> =>
  ({
    kind: 'codex_realtime_event',
    schema_version: CODEX_REALTIME_SCHEMA_VERSION,
    stream_epoch: CODEX_REALTIME_STREAM_EPOCH,
    cursor: String(seq),
    event_id: `event-${seq}`,
    host_id: 'host-1',
    type,
    payload,
  }) as Extract<CodexRealtimeEvent, { type: TType }>

describe('Codex event reducer', () => {
  it('appends streaming deltas and lets the final upsert become authoritative', () => {
    const first = reduceCodexRealtimeEvent(
      createCodexSessionProjection(),
      event(CodexRealtimeEventType.ItemDelta, {
        item_id: 'item-1',
        thread_id: 'thread-1',
        turn_id: 'turn-1',
        delta: '你',
      }),
    )
    const second = reduceCodexRealtimeEvent(
      first,
      event(
        CodexRealtimeEventType.ItemDelta,
        {
          item_id: 'item-1',
          thread_id: 'thread-1',
          turn_id: 'turn-1',
          delta: '好',
        },
        1,
      ),
    )
    const finalState = reduceCodexRealtimeEvent(
      second,
      event(
        CodexRealtimeEventType.ItemUpsert,
        {
          item: {
            item_id: 'item-1',
            thread_id: 'thread-1',
            turn_id: 'turn-1',
            kind: CodexTimelineItemKind.AgentMessage,
            status: CodexTimelineItemStatus.Completed,
            text: '你好。',
          },
        },
        2,
      ),
    )

    expect(finalState.itemsById['item-1']).toMatchObject({
      text: '你好。',
      status: CodexTimelineItemStatus.Completed,
    })
    expect(finalState.orderedItemIdsByThread['thread-1']).toEqual(['item-1'])
  })

  it('replaces the matching optimistic user item with the server upsert', () => {
    const initial = createCodexSessionProjection()
    initial.itemsById['local-1'] = {
      item_id: 'local-1',
      thread_id: 'thread-1',
      turn_id: null,
      kind: CodexTimelineItemKind.UserMessage,
      status: CodexTimelineItemStatus.Completed,
      text: 'hello',
    }
    initial.orderedItemIdsByThread['thread-1'] = ['local-1']

    const reconciled = reduceCodexRealtimeEvent(
      initial,
      event(CodexRealtimeEventType.ItemUpsert, {
        item: {
          item_id: 'server-1',
          thread_id: 'thread-1',
          turn_id: 'turn-1',
          kind: CodexTimelineItemKind.UserMessage,
          status: CodexTimelineItemStatus.Completed,
          text: 'hello',
        },
      }),
    )

    expect(reconciled.itemsById['local-1']).toBeUndefined()
    expect(reconciled.orderedItemIdsByThread['thread-1']).toEqual(['server-1'])
  })

  it('replaces all stale thread items with the authority snapshot', () => {
    const initial = createCodexSessionProjection()
    initial.itemsById['local-stale'] = {
      item_id: 'local-stale',
      thread_id: 'thread-1',
      turn_id: null,
      kind: CodexTimelineItemKind.UserMessage,
      status: CodexTimelineItemStatus.Completed,
      text: 'stale',
    }
    initial.orderedItemIdsByThread['thread-1'] = ['local-stale']

    const restored = reduceCodexRealtimeEvent(
      initial,
      event(CodexRealtimeEventType.ThreadSnapshot, {
        thread: {
          thread_index_id: 'index-1',
          host_id: 'host-1',
          workspace_id: 'workspace-1',
          owner_subject_id: 'subject-1',
          upstream_thread_id: 'thread-1',
          display_name: 'Thread',
          model: null,
          reasoning_effort: null,
          status: 'idle',
          active_turn_id: null,
          archived: false,
          source_kind: null,
          created_at: null,
          updated_at: '2026-08-01T00:00:00Z',
          last_synced_at: '2026-08-01T00:00:00Z',
        },
        turns: [],
        history_status: CodexThreadHistoryStatus.Complete,
        items: [
          {
            item_id: 'server-1',
            thread_id: 'thread-1',
            turn_id: 'turn-1',
            kind: CodexTimelineItemKind.AgentMessage,
            status: CodexTimelineItemStatus.Completed,
            text: 'authority',
          },
        ],
      }),
    )

    expect(restored.itemsById['local-stale']).toBeUndefined()
    expect(restored.orderedItemIdsByThread['thread-1']).toEqual(['server-1'])
  })

  it('preserves realtime items when oversized authority history is omitted', () => {
    const initial = createCodexSessionProjection()
    initial.itemsById['live-1'] = {
      item_id: 'live-1',
      thread_id: 'thread-1',
      turn_id: null,
      kind: CodexTimelineItemKind.AgentMessage,
      status: CodexTimelineItemStatus.Completed,
      text: 'live result',
    }
    initial.orderedItemIdsByThread['thread-1'] = ['live-1']

    const restored = reduceCodexRealtimeEvent(
      initial,
      event(CodexRealtimeEventType.ThreadSnapshot, {
        thread: {
          thread_index_id: 'index-1',
          host_id: 'host-1',
          workspace_id: 'workspace-1',
          owner_subject_id: 'subject-1',
          upstream_thread_id: 'thread-1',
          display_name: 'Large thread',
          model: null,
          reasoning_effort: null,
          status: 'idle',
          active_turn_id: null,
          archived: false,
          source_kind: null,
          created_at: null,
          updated_at: '2026-08-03T00:00:00Z',
          last_synced_at: '2026-08-03T00:00:00Z',
        },
        turns: [],
        items: [],
        history_status: CodexThreadHistoryStatus.OmittedTooLarge,
      }),
    )

    expect(restored.itemsById['live-1']).toBeDefined()
    expect(restored.orderedItemIdsByThread['thread-1']).toEqual(['live-1'])
    expect(restored.historyStatusByThread['thread-1']).toBe(
      CodexThreadHistoryStatus.OmittedTooLarge,
    )
  })

  it('rejects a thread snapshot with an unknown history status', () => {
    expect(() =>
      validateCodexRealtimeEvent({
        ...event(CodexRealtimeEventType.ThreadSnapshot, {
          thread: {},
          turns: [],
          items: [],
          history_status: CodexThreadHistoryStatus.Complete,
        } as never),
        payload: {
          thread: {},
          turns: [],
          items: [],
          history_status: 'unknown_status',
        },
      }),
    ).toThrow(CodexRealtimeContractError)
  })

  it('creates plan and diff timeline items from stable product events', () => {
    const withPlan = reduceCodexRealtimeEvent(
      createCodexSessionProjection(),
      event(CodexRealtimeEventType.TurnPlanUpdated, {
        item_id: 'plan-1',
        thread_id: 'thread-1',
        turn_id: 'turn-1',
        steps: [{ step: '检查代码', status: 'in_progress' }],
      }),
    )
    const withDiff = reduceCodexRealtimeEvent(
      withPlan,
      event(
        CodexRealtimeEventType.TurnDiffUpdated,
        {
          item_id: 'diff-1',
          thread_id: 'thread-1',
          turn_id: 'turn-1',
          diff: '+new line',
        },
        1,
      ),
    )

    expect(withDiff.itemsById['plan-1']?.kind).toBe(CodexTimelineItemKind.Plan)
    expect(withDiff.itemsById['diff-1']?.kind).toBe(CodexTimelineItemKind.Diff)
  })

  it('accepts the frozen realtime schema version', () => {
    expect(
      validateCodexRealtimeEvent(
        event(CodexRealtimeEventType.ProtocolWarning, {
          warning: 'current schema',
        }),
      ),
    ).toMatchObject({
      schema_version: CODEX_REALTIME_SCHEMA_VERSION,
      stream_epoch: CODEX_REALTIME_STREAM_EPOCH,
    })
  })

  it('rejects unknown schema versions before state mutation', () => {
    expect(() =>
      validateCodexRealtimeEvent({
        ...event(CodexRealtimeEventType.ProtocolWarning, {
          warning: 'old schema',
        }),
        schema_version: INCOMPATIBLE_CODEX_REALTIME_SCHEMA_VERSION,
      }),
    ).toThrow(CodexRealtimeContractError)
  })

  it('projects turn lifecycle into active thread state for steer and interrupt', () => {
    const initial = createCodexSessionProjection()
    initial.threadsById['thread-1'] = {
      thread_index_id: 'index-1',
      host_id: 'host-1',
      workspace_id: 'workspace-1',
      owner_subject_id: 'subject-1',
      upstream_thread_id: 'thread-1',
      display_name: 'Thread',
      model: null,
      reasoning_effort: null,
      status: 'idle',
      active_turn_id: null,
      archived: false,
      source_kind: null,
      created_at: null,
      updated_at: '2026-08-01T00:00:00Z',
      last_synced_at: '2026-08-01T00:00:00Z',
    }
    const started = reduceCodexRealtimeEvent(
      initial,
      event(CodexRealtimeEventType.TurnStarted, {
        turn: {
          turn_id: 'turn-1',
          thread_id: 'thread-1',
          status: 'active',
          started_at: null,
          completed_at: null,
          error_message: null,
        },
      }),
    )
    expect(started.threadsById['thread-1']?.active_turn_id).toBe('turn-1')
    const interrupted = reduceCodexRealtimeEvent(
      started,
      event(CodexRealtimeEventType.TurnInterrupted, {
        turn: {
          turn_id: 'turn-1',
          thread_id: 'thread-1',
          status: 'interrupted',
          started_at: null,
          completed_at: null,
          error_message: null,
        },
      }),
    )
    expect(interrupted.threadsById['thread-1']?.active_turn_id).toBeNull()
    expect(interrupted.threadsById['thread-1']?.status).toBe('interrupted')
  })

  it('merges partial thread updates without discarding authoritative fields', () => {
    const initial = createCodexSessionProjection()
    initial.threadsById['thread-1'] = {
      thread_index_id: 'index-1',
      host_id: 'host-1',
      workspace_id: 'workspace-1',
      owner_subject_id: 'subject-1',
      upstream_thread_id: 'thread-1',
      display_name: 'Existing thread',
      model: 'model-1',
      reasoning_effort: null,
      status: 'idle',
      active_turn_id: null,
      archived: false,
      source_kind: 'app-server',
      created_at: null,
      updated_at: '2026-08-01T00:00:00Z',
      last_synced_at: '2026-08-01T00:00:00Z',
    }

    const updated = reduceCodexRealtimeEvent(
      initial,
      event(CodexRealtimeEventType.ThreadUpdated, {
        thread: {
          host_id: 'host-1',
          workspace_id: 'workspace-1',
          upstream_thread_id: 'thread-1',
          status: 'active',
        },
      }),
    )

    expect(updated.threadsById['thread-1']).toMatchObject({
      display_name: 'Existing thread',
      model: 'model-1',
      status: 'active',
    })
  })

  it('bounds streaming content instead of growing with a 10MB output', () => {
    const oversized = 'x'.repeat(10 * 1024 * 1024)
    const bounded = reduceCodexRealtimeEvent(
      createCodexSessionProjection(),
      event(CodexRealtimeEventType.ItemDelta, {
        item_id: 'item-large',
        thread_id: 'thread-1',
        turn_id: 'turn-1',
        delta: oversized,
      }),
    )
    const item = bounded.itemsById['item-large']

    expect(item && 'text' in item ? item.text.length : 0).toBeLessThanOrEqual(
      CODEX_TIMELINE_TEXT_LIMIT,
    )
    expect(item && 'text' in item ? item.text : '').toContain(
      CODEX_CONTENT_TRUNCATED_NOTICE.trim(),
    )
  })
})
