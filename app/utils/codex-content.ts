export const CODEX_TIMELINE_TEXT_LIMIT = 1_048_576
export const CODEX_COMMAND_OUTPUT_LIMIT = 1_048_576
export const CODEX_DIFF_LIMIT = 1_048_576

export const CODEX_CONTENT_TRUNCATED_NOTICE =
  '\n\n[内容已截断，请在本机 Codex 中查看完整内容。]'

export const truncateCodexContent = (value: string, limit: number): string => {
  if (value.length <= limit) return value
  let retainedLength = Math.max(
    0,
    limit - CODEX_CONTENT_TRUNCATED_NOTICE.length,
  )
  if (
    retainedLength > 0 &&
    /[\uD800-\uDBFF]/.test(value[retainedLength - 1] ?? '')
  )
    retainedLength -= 1
  return `${value.slice(0, retainedLength)}${CODEX_CONTENT_TRUNCATED_NOTICE}`
}

export const appendCodexContent = (
  current: string,
  delta: string,
  limit: number,
): string => {
  if (current.endsWith(CODEX_CONTENT_TRUNCATED_NOTICE)) return current
  return truncateCodexContent(`${current}${delta}`, limit)
}
