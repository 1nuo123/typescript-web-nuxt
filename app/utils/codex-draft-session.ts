/** 当前标签页草稿的 sessionStorage 边界，正文永不进入跨标签或长期存储。 */

const CODEX_DRAFT_SESSION_PREFIX = 'codex:draft:v1'

export interface CodexDraftSessionScope {
  ownerSubjectId: string
  threadId: string
}

const encodeKeySegment = (value: string): string => encodeURIComponent(value)

export const buildCodexDraftSessionKey = (
  scope: CodexDraftSessionScope,
): string =>
  [
    CODEX_DRAFT_SESSION_PREFIX,
    encodeKeySegment(scope.ownerSubjectId),
    encodeKeySegment(scope.threadId),
  ].join(':')

export const readCodexDraftSession = (
  storage: Storage,
  scope: CodexDraftSessionScope,
): string | null => {
  const value = storage.getItem(buildCodexDraftSessionKey(scope))
  return value && value.trim() ? value : null
}

export const writeCodexDraftSession = (
  storage: Storage,
  scope: CodexDraftSessionScope,
  draft: string,
): void => {
  const key = buildCodexDraftSessionKey(scope)
  if (!draft) {
    storage.removeItem(key)
    return
  }
  storage.setItem(key, draft)
}
