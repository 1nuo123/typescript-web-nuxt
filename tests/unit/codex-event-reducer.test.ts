import { describe, expect, it } from 'vitest'
import {
  CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
  CodexDiffChangeKind,
  CodexTimelineItemKind,
  CodexTimelineItemSource,
  CodexTimelineItemStatus,
  type CodexCommandTimelineItem,
  type CodexTextTimelineItem,
} from '../../app/types/codex-item'
import {
  CodexThreadHistoryStatus,
  CodexThreadStatus,
  CodexThreadTitleSource,
  type CodexThread,
} from '../../app/types/codex-thread'
import {
  CODEX_REALTIME_SCHEMA_VERSION,
  CODEX_REALTIME_STREAM_EPOCH,
  CodexRealtimeEventType,
  type CodexRealtimeEvent,
} from '../../app/types/codex-realtime'
import {
  createCodexSessionProjection,
  reduceCodexRealtimeEvent,
  replaceCodexThreadsForQuery,
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
const THREAD_TIMESTAMP = '2026-08-01T00:00:00Z'

const event = <TType extends CodexRealtimeEventType>(
  type: TType,
  detail: Omit<
    Extract<CodexRealtimeEvent, { detail: { kind: TType } }>['detail'],
    'kind' | 'schema_version'
  >,
  sequence = 0,
): Extract<CodexRealtimeEvent, { detail: { kind: TType } }> =>
  ({
    header: {
      kind: 'codex_realtime_event',
      schema_version: CODEX_REALTIME_SCHEMA_VERSION,
      stream_epoch: CODEX_REALTIME_STREAM_EPOCH,
      cursor: String(sequence),
      event_id: `event-${sequence}`,
      occurred_at: new Date(
        Date.parse(THREAD_TIMESTAMP) + sequence,
      ).toISOString(),
      host_id: 'host-1',
      detail_kind: type,
    },
    detail: {
      kind: type,
      schema_version: CODEX_REALTIME_SCHEMA_VERSION,
      ...detail,
    },
  }) as Extract<CodexRealtimeEvent, { detail: { kind: TType } }>

const thread = (overrides: Partial<CodexThread> = {}): CodexThread => ({
  thread_index_id: 'index-1',
  host_id: 'host-1',
  workspace_id: 'workspace-1',
  owner_subject_id: 'subject-1',
  upstream_thread_id: 'thread-1',
  display_name: 'Architecture review',
  title_source: CodexThreadTitleSource.Manual,
  model: 'gpt-5.6',
  model_provider: 'openai',
  reasoning_effort: 'high',
  status: CodexThreadStatus.Idle,
  active_turn_id: null,
  archived: false,
  is_pinned: false,
  source_kind: 'app_server',
  created_at: THREAD_TIMESTAMP,
  recency_at: THREAD_TIMESTAMP,
  updated_at: THREAD_TIMESTAMP,
  last_synced_at: THREAD_TIMESTAMP,
  ...overrides,
})

const messageItem = (
  itemId: string,
  kind: CodexTimelineItemKind.UserMessage | CodexTimelineItemKind.AgentMessage,
  text: string,
): CodexTextTimelineItem => ({
  header: {
    item_id: itemId,
    thread_id: 'thread-1',
    turn_id: 'turn-1',
    detail_kind: kind,
    schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
    status: CodexTimelineItemStatus.Completed,
  },
  detail: {
    kind,
    schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
    text,
  },
})

const commandItem = (
  itemId: string,
  output: string,
): CodexCommandTimelineItem => ({
  header: {
    item_id: itemId,
    thread_id: 'thread-1',
    turn_id: 'turn-1',
    detail_kind: CodexTimelineItemKind.Command,
    schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
    status: CodexTimelineItemStatus.Completed,
  },
  detail: {
    kind: CodexTimelineItemKind.Command,
    schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
    command: 'Write-Output APPROVAL_TEST',
    output,
    exit_code: 0,
  },
})

describe('Codex event reducer', () => {
  it('purges every projection owned by a host missing from the authority snapshot', () => {
    const initial = createCodexSessionProjection()
    initial.hostsById['host-1'] = { host_id: 'host-1' } as never
    initial.workspacesById['workspace-1'] = {
      workspace_id: 'workspace-1',
      host_id: 'host-1',
    } as never
    initial.threadsById['thread-1'] = thread()
    initial.turnsById['turn-1'] = {
      turn_id: 'turn-1',
      thread_id: 'thread-1',
    } as never
    initial.itemsById['item-1'] = messageItem(
      'item-1',
      CodexTimelineItemKind.AgentMessage,
      '结果',
    )
    initial.orderedItemIdsByThread['thread-1'] = ['item-1']
    initial.historyStatusByThread['thread-1'] =
      CodexThreadHistoryStatus.Complete
    initial.historyCursorByThread['thread-1'] = 'cursor-1'

    const purged = reduceCodexRealtimeEvent(
      initial,
      event(CodexRealtimeEventType.HostSnapshot, { hosts: [] }),
    )

    expect(purged.hostsById).toEqual({})
    expect(purged.workspacesById).toEqual({})
    expect(purged.threadsById).toEqual({})
    expect(purged.turnsById).toEqual({})
    expect(purged.itemsById).toEqual({})
    expect(purged.orderedItemIdsByThread).toEqual({})
    expect(purged.historyStatusByThread).toEqual({})
    expect(purged.historyCursorByThread).toEqual({})
  })

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
          item: messageItem(
            'item-1',
            CodexTimelineItemKind.AgentMessage,
            '你好。',
          ),
        },
        2,
      ),
    )

    expect(finalState.itemsById['item-1']?.detail).toMatchObject({
      text: '你好。',
    })
    expect(finalState.itemsById['item-1']?.header.status).toBe(
      CodexTimelineItemStatus.Completed,
    )
    expect(finalState.orderedItemIdsByThread['thread-1']).toEqual(['item-1'])
  })

  it('replaces the matching optimistic user item with the server upsert', () => {
    const initial = createCodexSessionProjection()
    initial.itemsById['local-1'] = messageItem(
      'local-1',
      CodexTimelineItemKind.UserMessage,
      'hello',
    )
    initial.orderedItemIdsByThread['thread-1'] = ['local-1']

    const reconciled = reduceCodexRealtimeEvent(
      initial,
      event(CodexRealtimeEventType.ItemUpsert, {
        item: messageItem(
          'server-1',
          CodexTimelineItemKind.UserMessage,
          'hello',
        ),
      }),
    )

    expect(reconciled.itemsById['local-1']).toBeUndefined()
    expect(reconciled.orderedItemIdsByThread['thread-1']).toEqual(['server-1'])
  })

  it('merges complete authority history without deleting confirmed realtime output', () => {
    const initial = createCodexSessionProjection()
    initial.itemsById['local-optimistic'] = messageItem(
      'local-optimistic',
      CodexTimelineItemKind.UserMessage,
      'optimistic',
    )
    initial.itemsById['command-realtime'] = commandItem(
      'command-realtime',
      'APPROVAL_TEST',
    )
    initial.itemSourceById['local-optimistic'] =
      CodexTimelineItemSource.Optimistic
    initial.itemSourceById['command-realtime'] =
      CodexTimelineItemSource.Realtime
    initial.orderedItemIdsByThread['thread-1'] = [
      'local-optimistic',
      'command-realtime',
    ]

    const restored = reduceCodexRealtimeEvent(
      initial,
      event(CodexRealtimeEventType.ThreadSnapshot, {
        thread: thread(),
        turns: [],
        items: [
          messageItem(
            'server-1',
            CodexTimelineItemKind.AgentMessage,
            'authority',
          ),
        ],
        history_status: CodexThreadHistoryStatus.Complete,
        next_history_cursor: null,
      }),
    )

    expect(restored.itemsById['local-optimistic']).toBeUndefined()
    expect(restored.itemsById['command-realtime']?.detail).toMatchObject({
      output: 'APPROVAL_TEST',
    })
    expect(restored.orderedItemIdsByThread['thread-1']).toEqual([
      'command-realtime',
      'server-1',
    ])

    const omitted = reduceCodexRealtimeEvent(
      restored,
      event(CodexRealtimeEventType.ThreadSnapshot, {
        thread: thread({ recency_at: '2026-08-03T00:00:00Z' }),
        turns: [],
        items: [],
        history_status: CodexThreadHistoryStatus.OmittedTooLarge,
        next_history_cursor: null,
      }),
    )

    expect(omitted.itemsById['server-1']).toBeDefined()
    expect(omitted.itemsById['command-realtime']).toBeDefined()
    expect(omitted.historyStatusByThread['thread-1']).toBe(
      CodexThreadHistoryStatus.OmittedTooLarge,
    )
  })

  it('creates plan and structured diff timeline items from stable product events', () => {
    const withPlan = reduceCodexRealtimeEvent(
      createCodexSessionProjection(),
      event(CodexRealtimeEventType.TurnPlanUpdated, {
        item_id: 'plan-1',
        thread_id: 'thread-1',
        turn_id: 'turn-1',
        explanation: '按阶段执行。',
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
          diff: {
            files: [
              {
                path: 'app.py',
                old_path: null,
                change_kind: CodexDiffChangeKind.Modified,
                binary: false,
                large: false,
                truncated: false,
                hunks: [],
              },
            ],
            total_characters: 0,
            truncated: false,
          },
        },
        1,
      ),
    )

    expect(withDiff.itemsById['plan-1']?.detail.kind).toBe(
      CodexTimelineItemKind.Plan,
    )
    expect(withDiff.itemsById['diff-1']?.detail.kind).toBe(
      CodexTimelineItemKind.Diff,
    )
  })

  it('rejects unknown schema, mismatched detail and invalid nested diff before mutation', () => {
    const valid = event(CodexRealtimeEventType.ProtocolWarning, {
      warning: 'current schema',
    })
    expect(validateCodexRealtimeEvent(valid)).toMatchObject({
      header: {
        schema_version: CODEX_REALTIME_SCHEMA_VERSION,
        stream_epoch: CODEX_REALTIME_STREAM_EPOCH,
      },
    })
    expect(() =>
      validateCodexRealtimeEvent({
        ...valid,
        header: {
          ...valid.header,
          schema_version: INCOMPATIBLE_CODEX_REALTIME_SCHEMA_VERSION,
        },
      }),
    ).toThrow(CodexRealtimeContractError)
    expect(() =>
      validateCodexRealtimeEvent({
        ...valid,
        detail: {
          ...valid.detail,
          kind: CodexRealtimeEventType.ConnectionHeartbeat,
        },
      }),
    ).toThrow(CodexRealtimeContractError)
    expect(() =>
      validateCodexRealtimeEvent({
        header: {
          ...valid.header,
          detail_kind: CodexRealtimeEventType.ItemUpsert,
        },
        detail: {
          kind: CodexRealtimeEventType.ItemUpsert,
          schema_version: CODEX_REALTIME_SCHEMA_VERSION,
          item: {
            header: {
              item_id: 'diff-null',
              thread_id: 'thread-1',
              turn_id: 'turn-1',
              detail_kind: CodexTimelineItemKind.Diff,
              schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
              status: CodexTimelineItemStatus.Completed,
            },
            detail: {
              kind: CodexTimelineItemKind.Diff,
              schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
              diff: null,
            },
          },
        },
      }),
    ).toThrow(CodexRealtimeContractError)
    expect(() =>
      validateCodexRealtimeEvent({
        ...valid,
        header: { ...valid.header, occurred_at: 'not-a-timestamp' },
      }),
    ).toThrow(CodexRealtimeContractError)
  })

  it('projects turn lifecycle and finalizes streaming items atomically', () => {
    const initial = createCodexSessionProjection()
    initial.threadsById['thread-1'] = thread()
    const streaming = reduceCodexRealtimeEvent(
      initial,
      event(CodexRealtimeEventType.ItemDelta, {
        item_id: 'item-streaming',
        thread_id: 'thread-1',
        turn_id: 'turn-1',
        delta: 'partial',
      }),
    )
    const started = reduceCodexRealtimeEvent(
      streaming,
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
    const completed = reduceCodexRealtimeEvent(
      started,
      event(CodexRealtimeEventType.TurnCompleted, {
        turn: {
          turn_id: 'turn-1',
          thread_id: 'thread-1',
          status: 'completed',
          started_at: null,
          completed_at: '2026-08-01T00:01:00Z',
          error_message: null,
        },
      }),
    )

    expect(started.threadsById['thread-1']?.active_turn_id).toBe('turn-1')
    expect(completed.threadsById['thread-1']?.active_turn_id).toBeNull()
    expect(completed.itemsById['item-streaming']?.header.status).toBe(
      CodexTimelineItemStatus.Completed,
    )
  })

  it('merges partial thread updates without discarding manual title metadata', () => {
    const initial = createCodexSessionProjection()
    initial.threadsById['thread-1'] = thread()

    const updated = reduceCodexRealtimeEvent(
      initial,
      event(CodexRealtimeEventType.ThreadUpdated, {
        thread: {
          host_id: 'host-1',
          workspace_id: 'workspace-1',
          upstream_thread_id: 'thread-1',
          status: CodexThreadStatus.Active,
        },
      }),
    )

    expect(updated.threadsById['thread-1']).toMatchObject({
      display_name: 'Architecture review',
      title_source: CodexThreadTitleSource.Manual,
      model: 'gpt-5.6',
      status: CodexThreadStatus.Active,
    })
  })

  it('keeps recency monotonic across duplicate events and scoped list refreshes', () => {
    const initial = createCodexSessionProjection()
    initial.threadsById['thread-1'] = thread({
      recency_at: '2026-08-01T00:10:00Z',
    })
    const afterEvent = reduceCodexRealtimeEvent(
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
    const afterQuery = replaceCodexThreadsForQuery(
      afterEvent,
      {
        hostId: 'host-1',
        workspaceId: 'workspace-1',
        archived: false,
        searchTerm: '',
      },
      [thread({ recency_at: '2026-08-01T00:05:00Z' })],
    )

    expect(afterEvent.threadsById['thread-1']?.recency_at).toBe(
      '2026-08-01T00:10:00Z',
    )
    expect(afterQuery.threadsById['thread-1']?.recency_at).toBe(
      '2026-08-01T00:10:00Z',
    )
  })

  it('normalizes context compaction as a dedicated product timeline item', () => {
    const normalized = validateCodexRealtimeEvent(
      event(CodexRealtimeEventType.ItemUpsert, {
        item: {
          header: {
            item_id: 'compact-1',
            thread_id: 'thread-1',
            turn_id: 'turn-1',
            detail_kind: CodexTimelineItemKind.ContextCompaction,
            schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
            status: CodexTimelineItemStatus.Completed,
          },
          detail: {
            kind: CodexTimelineItemKind.ContextCompaction,
            schema_version: CODEX_TIMELINE_ITEM_SCHEMA_VERSION,
            label: '上下文已压缩',
          },
        },
      }),
    )

    expect(normalized.detail).toMatchObject({
      item: {
        detail: {
          kind: CodexTimelineItemKind.ContextCompaction,
          label: '上下文已压缩',
        },
      },
    })
  })

  it('bounds streaming content instead of retaining a 10 MiB output', () => {
    const bounded = reduceCodexRealtimeEvent(
      createCodexSessionProjection(),
      event(CodexRealtimeEventType.ItemDelta, {
        item_id: 'item-large',
        thread_id: 'thread-1',
        turn_id: 'turn-1',
        delta: 'x'.repeat(10 * 1024 * 1024),
      }),
    )
    const item = bounded.itemsById['item-large']
    const text = item && 'text' in item.detail ? item.detail.text : ''

    expect(text.length).toBeLessThanOrEqual(CODEX_TIMELINE_TEXT_LIMIT)
    expect(text).toContain(CODEX_CONTENT_TRUNCATED_NOTICE.trim())
  })
})
