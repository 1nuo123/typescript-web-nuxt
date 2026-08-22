// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest'
import {
  buildCodexDraftSessionKey,
  readCodexDraftSession,
  writeCodexDraftSession,
} from '../../app/utils/codex-draft-session'

const scope = { ownerSubjectId: 'subject-1', threadId: 'thread-1' }

const createIsolatedSessionStorage = (): Storage => {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  }
}

describe('Codex draft session storage', () => {
  afterEach(() => sessionStorage.clear())

  it('scopes a draft to the authenticated subject and current thread', () => {
    writeCodexDraftSession(sessionStorage, scope, '仅当前标签页')

    expect(readCodexDraftSession(sessionStorage, scope)).toBe('仅当前标签页')
    expect(
      readCodexDraftSession(sessionStorage, {
        ownerSubjectId: 'subject-2',
        threadId: scope.threadId,
      }),
    ).toBeNull()
    expect(buildCodexDraftSessionKey(scope)).toContain('subject-1')
  })

  it('removes an empty draft instead of retaining message content', () => {
    writeCodexDraftSession(sessionStorage, scope, '临时草稿')
    writeCodexDraftSession(sessionStorage, scope, '')

    expect(readCodexDraftSession(sessionStorage, scope)).toBeNull()
  })

  it('draft_refresh_survives_current_tab_only', () => {
    writeCodexDraftSession(sessionStorage, scope, '刷新后仍可恢复')

    expect(readCodexDraftSession(sessionStorage, scope)).toBe('刷新后仍可恢复')
  })

  it('draft_tab_close_is_not_restored_in_new_tab', () => {
    const closingTabStorage = createIsolatedSessionStorage()
    const newTabStorage = createIsolatedSessionStorage()
    writeCodexDraftSession(closingTabStorage, scope, '不会进入新标签页')

    expect(readCodexDraftSession(newTabStorage, scope)).toBeNull()
  })
})
