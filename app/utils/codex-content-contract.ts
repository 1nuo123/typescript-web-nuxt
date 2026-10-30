import type {
  CodexContentDescriptor,
  CodexContentChunk,
} from '~/types/codex-content'

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('正文契约无效。')
  return value as Record<string, unknown>
}
const text = (value: unknown, max = 8192): string => {
  if (typeof value !== 'string' || value.length > max)
    throw new Error('正文文本契约无效。')
  return value
}
const integer = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('正文范围无效。')
  return value
}
const keys = (value: Record<string, unknown>, allowed: string[]): void => {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error('正文包含未知字段。')
}
const reasons = [
  'content_revision_stale',
  'content_reference_expired',
  'content_range_invalid',
  'content_capability_unavailable',
  'source_item_too_large',
  'content_read_overloaded',
  'content_read_timeout',
  'message_too_large',
] as const

export const parseCodexContentDescriptor = (
  input: unknown,
): CodexContentDescriptor => {
  const value = object(input)
  const field = value.field
  if (field !== 'text' && field !== 'output' && field !== 'diff')
    throw new Error('正文域无效。')
  const revision = text(value.revision, 128)
  if (!revision) throw new Error('正文版本缺失。')
  const base: {
    field: 'text' | 'output' | 'diff'
    revision: string
    total_bytes: number | null
  } = {
    field,
    revision,
    total_bytes: value.total_bytes == null ? null : integer(value.total_bytes),
  }
  const shared = ['field', 'revision', 'total_bytes', 'availability']
  if (value.availability === 'inline') {
    keys(value, [...shared, 'text'])
    return { ...base, availability: 'inline', text: text(value.text, 4096) }
  }
  const preview = text(value.preview, 4096)
  if (value.availability === 'readable') {
    keys(value, [...shared, 'preview', 'content_ref', 'expires_at'])
    const expires_at = text(value.expires_at, 64)
    const content_ref = text(value.content_ref)
    if (!content_ref || !Number.isFinite(Date.parse(expires_at)))
      throw new Error('正文引用无效。')
    return {
      ...base,
      availability: 'readable',
      preview,
      content_ref,
      expires_at,
    }
  }
  if (value.availability === 'unavailable') {
    keys(value, [...shared, 'preview', 'unavailable_reason'])
    const reason = reasons.find(
      (candidate) => candidate === value.unavailable_reason,
    )
    if (!reason) throw new Error('正文不可用原因无效。')
    return {
      ...base,
      availability: 'unavailable',
      preview,
      unavailable_reason: reason,
    }
  }
  throw new Error('正文可用性无效。')
}

export const parseCodexContentChunk = (input: unknown): CodexContentChunk => {
  const value = object(input)
  keys(value, [
    'kind',
    'schema_version',
    'revision',
    'offset',
    'next_offset',
    'text',
    'eof',
    'total_bytes',
  ])
  if (
    value.kind !== 'codex_content_chunk' ||
    value.schema_version !== '1.0' ||
    typeof value.eof !== 'boolean'
  )
    throw new Error('正文块版本无效。')
  const offset = integer(value.offset)
  const next_offset = integer(value.next_offset)
  const body = text(value.text, 65536)
  const total_bytes =
    value.total_bytes == null ? null : integer(value.total_bytes)
  if (
    next_offset !== offset + new TextEncoder().encode(body).length ||
    (!value.eof && next_offset <= offset) ||
    (total_bytes !== null &&
      (next_offset > total_bytes ||
        value.eof !== (next_offset === total_bytes)))
  )
    throw new Error('正文块边界不一致。')
  return {
    kind: 'codex_content_chunk',
    schema_version: '1.0',
    revision: text(value.revision, 128),
    offset,
    next_offset,
    text: body,
    eof: value.eof,
    total_bytes,
  }
}
