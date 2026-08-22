import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CODEX_REALTIME_BATCH_PROTOCOL_VERSION } from '../../app/types/codex-realtime'
import {
  validateCodexRealtimeBatch,
  validateCodexRealtimeEvent,
} from '../../app/utils/codex-event-validator'
import {
  createCodexSessionProjection,
  reduceCodexRealtimeBatch,
} from '../../app/utils/codex-event-reducer'
import { buildCodexDeltaFixture } from '../fixtures/codex-stream-fixture'

const SHARED_BATCH_FIXTURE_PATH = fileURLToPath(
  new URL(
    '../../../work/test/fixtures/codex_realtime_batch_contract.json',
    import.meta.url,
  ),
)
const SHARED_STREAM_FIXTURE_PATH = fileURLToPath(
  new URL(
    '../../../work/test/fixtures/codex_stream_contract.json',
    import.meta.url,
  ),
)

describe('Codex realtime batch contract', () => {
  it('accepts a same-epoch batch whose bounds match its events', () => {
    const first = buildCodexDeltaFixture('first', '1')
    const last = buildCodexDeltaFixture('last', '2')

    expect(
      validateCodexRealtimeBatch({
        protocol_version: CODEX_REALTIME_BATCH_PROTOCOL_VERSION,
        stream_epoch: 'fixture-epoch-1',
        first_cursor: '1',
        last_cursor: '2',
        barrier: false,
        events: [first, last],
      }),
    ).toMatchObject({ first_cursor: '1', last_cursor: '2' })
  })

  it('rejects a batch whose boundary cursor does not match', () => {
    const event = buildCodexDeltaFixture('first', '1')

    expect(() =>
      validateCodexRealtimeBatch({
        protocol_version: CODEX_REALTIME_BATCH_PROTOCOL_VERSION,
        stream_epoch: 'fixture-epoch-1',
        first_cursor: 'unexpected',
        last_cursor: '1',
        barrier: false,
        events: [event],
      }),
    ).toThrow('首尾cursor')
  })

  it('rejects cross-epoch events', () => {
    const event = buildCodexDeltaFixture('first', '1')
    event.header.stream_epoch = 'another-epoch'

    expect(() =>
      validateCodexRealtimeBatch({
        protocol_version: CODEX_REALTIME_BATCH_PROTOCOL_VERSION,
        stream_epoch: 'fixture-epoch-1',
        first_cursor: '1',
        last_cursor: '1',
        barrier: false,
        events: [event],
      }),
    ).toThrow('跨epoch')
  })

  it('rejects a barrier batch containing a normal event', () => {
    const event = buildCodexDeltaFixture('first', '1')

    expect(() =>
      validateCodexRealtimeBatch({
        protocol_version: CODEX_REALTIME_BATCH_PROTOCOL_VERSION,
        stream_epoch: 'fixture-epoch-1',
        first_cursor: '1',
        last_cursor: '1',
        barrier: true,
        events: [event],
      }),
    ).toThrow('屏障批次')
  })

  it('validates the shared Agent, FastAPI, and browser batch fixture', () => {
    const fixture = JSON.parse(
      readFileSync(SHARED_BATCH_FIXTURE_PATH, 'utf8'),
    ) as { browser_batches: unknown[] }

    const batches = fixture.browser_batches.map(validateCodexRealtimeBatch)

    expect(batches.map((batch) => batch.barrier)).toEqual([false, true])
    expect(batches.map((batch) => batch.events[0]?.header.detail_kind)).toEqual(
      ['item.delta', 'protocol.warning'],
    )
  })

  it('replays the shared stream fixture into the same final projection', () => {
    const fixture = JSON.parse(
      readFileSync(SHARED_STREAM_FIXTURE_PATH, 'utf8'),
    ) as {
      events: unknown[]
      expected_projection: {
        item_id: string
        thread_id: string
        text: string
        event_ids: string[]
        cursors: string[]
      }
    }
    const events = fixture.events.map(validateCodexRealtimeEvent)
    const deltas = events.filter((event) => event.detail.kind === 'item.delta')
    const projection = reduceCodexRealtimeBatch(
      createCodexSessionProjection(),
      events,
    )

    expect(events.map((event) => event.header.event_id)).toEqual(
      fixture.expected_projection.event_ids,
    )
    expect(events.map((event) => event.header.cursor)).toEqual(
      fixture.expected_projection.cursors,
    )
    expect(deltas.map((event) => event.detail.delta).join('')).toBe(
      fixture.expected_projection.text,
    )
    expect(deltas[0]?.detail.item_id).toBe(fixture.expected_projection.item_id)
    expect(deltas[0]?.detail.thread_id).toBe(
      fixture.expected_projection.thread_id,
    )
    expect(
      projection.itemsById[fixture.expected_projection.item_id],
    ).toMatchObject({
      detail: {
        text: fixture.expected_projection.text,
      },
    })
  })
})
