export enum CodexDiffLineKind {
  Context = 'context',
  Addition = 'addition',
  Deletion = 'deletion',
  Header = 'header',
}

export interface CodexDiffLine {
  kind: CodexDiffLineKind
  content: string
}

export const parseCodexDiff = (diff: string): CodexDiffLine[] =>
  diff.split('\n').map((content) => {
    if (
      content.startsWith('+++') ||
      content.startsWith('---') ||
      content.startsWith('@@')
    ) {
      return { kind: CodexDiffLineKind.Header, content }
    }
    if (content.startsWith('+')) {
      return { kind: CodexDiffLineKind.Addition, content }
    }
    if (content.startsWith('-')) {
      return { kind: CodexDiffLineKind.Deletion, content }
    }
    return { kind: CodexDiffLineKind.Context, content }
  })
