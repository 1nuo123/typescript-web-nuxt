import { describe, expect, it } from 'vitest'
import { CodexDiffLineKind, parseCodexDiff } from '../../app/utils/codex-diff'

describe('Codex diff parser', () => {
  it('classifies headers, additions, deletions and context without rendering HTML', () => {
    expect(
      parseCodexDiff('--- a.ts\n+++ b.ts\n@@ -1 +1 @@\n-old\n+new\n same'),
    ).toEqual([
      { kind: CodexDiffLineKind.Header, content: '--- a.ts' },
      { kind: CodexDiffLineKind.Header, content: '+++ b.ts' },
      { kind: CodexDiffLineKind.Header, content: '@@ -1 +1 @@' },
      { kind: CodexDiffLineKind.Deletion, content: '-old' },
      { kind: CodexDiffLineKind.Addition, content: '+new' },
      { kind: CodexDiffLineKind.Context, content: ' same' },
    ])
  })

  it('keeps an empty diff as one context line', () => {
    expect(parseCodexDiff('')).toEqual([
      { kind: CodexDiffLineKind.Context, content: '' },
    ])
  })
})
