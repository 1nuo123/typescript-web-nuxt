import { describe, expect, it } from 'vitest'
import {
  parseCodexMarkdown,
  sanitizeCodexMarkdownLink,
} from '../../app/utils/codex-markdown'

describe('Codex Markdown parser', () => {
  it('parses common Markdown with raw HTML disabled', () => {
    const tokens = parseCodexMarkdown(
      '**完成** <script>alert(1)</script> [危险](javascript:alert(1))',
    )
    const inlineTokens = tokens.flatMap((token) => token.children ?? [])

    expect(inlineTokens.map((token) => token.type)).toContain('strong_open')
    expect(inlineTokens.map((token) => token.type)).not.toContain('html_inline')
    expect(inlineTokens.map((token) => token.content).join('')).toContain(
      '<script>alert(1)</script>',
    )
    expect(sanitizeCodexMarkdownLink('javascript:alert(1)')).toBeNull()
  })

  it('only allows explicit web and mail links', () => {
    expect(sanitizeCodexMarkdownLink('https://example.com')).toBe(
      'https://example.com',
    )
    expect(sanitizeCodexMarkdownLink('/auth/browser/refresh')).toBeNull()
    expect(sanitizeCodexMarkdownLink('data:text/html,payload')).toBeNull()
  })
})
