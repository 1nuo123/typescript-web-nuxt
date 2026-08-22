import {
  CODEX_REALTIME_SCHEMA_VERSION,
  CodexRealtimeEventType,
  type CodexRealtimeEvent,
} from '../../app/types/codex-realtime'

/** 在 unit 和 browser 测试中复用的长 Markdown 流式数据。 */
export const CODEX_LONG_MARKDOWN_FIXTURE = [
  '# 流式回放',
  '',
  '- 嵌套列表',
  '  - 保持稳定前缀',
  '',
  '```ts',
  'const partial = true',
].join('\n')

/** 影响虚拟项高度的受控场景集合。 */
export const CODEX_DYNAMIC_HEIGHT_FIXTURE = Object.freeze([
  'image_loaded',
  'code_wrap_toggled',
  'approval_opened',
  'history_prepended',
] as const)

/** 固定时间和游标使多频率回放可逐条比较最终投影。 */
export const buildCodexDeltaFixture = (
  delta: string,
  cursor = '1',
): CodexRealtimeEvent => ({
  header: {
    kind: 'codex_realtime_event',
    schema_version: CODEX_REALTIME_SCHEMA_VERSION,
    stream_epoch: 'fixture-epoch-1',
    cursor,
    event_id: `fixture-event-${cursor}`,
    occurred_at: '2026-01-01T00:00:00.000Z',
    host_id: '00000000-0000-0000-0000-000000000001',
    thread_id: 'fixture-thread-1',
    turn_id: 'fixture-turn-1',
    item_id: 'fixture-item-1',
    detail_kind: CodexRealtimeEventType.ItemDelta,
  },
  detail: {
    kind: CodexRealtimeEventType.ItemDelta,
    schema_version: CODEX_REALTIME_SCHEMA_VERSION,
    item_id: 'fixture-item-1',
    thread_id: 'fixture-thread-1',
    turn_id: 'fixture-turn-1',
    delta,
  },
})
