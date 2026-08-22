import { describe, expect, it } from 'vitest'
import {
  createCodexMarkdownParseCache,
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

  it('does not reparse a stable Markdown prefix while a tail is streaming', () => {
    const parsedSources: string[] = []
    const cache = createCodexMarkdownParseCache((source) => {
      parsedSources.push(source)
      return parseCodexMarkdown(source)
    })
    const stablePrefix = '第一段已经结束。\n\n'

    cache.render(`${stablePrefix}正在生成`, false)
    const second = cache.render(`${stablePrefix}正在生成更多内容`, false)

    expect(second.mode).toBe('incremental')
    expect(second.reusedStablePrefix).toBe(true)
    expect(
      parsedSources.filter((source) => source === stablePrefix),
    ).toHaveLength(1)
    expect(
      parsedSources.filter((source) => source.includes('第一段已经结束。')),
    ).toHaveLength(1)
    cache.clear()
  })

  it('keeps an incremental stable-prefix result equivalent to a full parse', () => {
    const cache = createCodexMarkdownParseCache()
    const source = '# 已确认标题\n\n第一段。\n\n仍在生成的尾部'

    const result = cache.render(source, false)

    expect(result.mode).toBe('incremental')
    expect(result.tokens).toEqual(parseCodexMarkdown(source))
    expect(Object.isFrozen(result.tokens)).toBe(true)
    cache.clear()
  })

  it.each([
    [
      'an unclosed fenced block',
      '稳定段落。\n\n```ts\nconst unfinished = true',
    ],
    [
      'a list that may continue across blank lines',
      '稳定段落。\n\n- 仍可能继续',
    ],
    [
      'a quote that may continue across blank lines',
      '稳定段落。\n\n> 仍可能继续',
    ],
  ])('falls back to a whole-message parse for %s', (_, source) => {
    const parsedSources: string[] = []
    const cache = createCodexMarkdownParseCache((source) => {
      parsedSources.push(source)
      return parseCodexMarkdown(source)
    })

    const result = cache.render(source, false)

    expect(result.mode).toBe('fallback')
    expect(result.stablePrefixLength).toBe(0)
    expect(parsedSources).toEqual([source])
    expect(result.tokens).toEqual(parseCodexMarkdown(source))
    cache.clear()
  })

  it('builds and freezes a canonical result when a terminal event arrives', () => {
    const parsedSources: string[] = []
    const cache = createCodexMarkdownParseCache((source) => {
      parsedSources.push(source)
      return parseCodexMarkdown(source)
    })
    const source = '第一段。\n\n第二段。'

    cache.render(source, false)
    const terminal = cache.render(source, true)
    const repeatedTerminal = cache.render(source, true)

    expect(terminal.mode).toBe('canonical')
    expect(terminal.stablePrefixLength).toBe(source.length)
    expect(terminal.tokens).toEqual(parseCodexMarkdown(source))
    expect(Object.isFrozen(terminal.tokens)).toBe(true)
    expect(repeatedTerminal).toBe(terminal)
    expect(parsedSources.at(-1)).toBe(source)
    cache.clear()
  })

  it('clears cached parser state when its timeline item is disposed', () => {
    const parsedSources: string[] = []
    const cache = createCodexMarkdownParseCache((source) => {
      parsedSources.push(source)
      return parseCodexMarkdown(source)
    })

    cache.render('首次渲染', false)
    cache.clear()
    const afterClear = cache.render('首次渲染', false)

    expect(afterClear.parseCount).toBe(1)
    expect(parsedSources).toEqual(['首次渲染', '首次渲染'])
  })

  it.each([30, 100])(
    'keeps a long stable prefix out of %iHz delta reparsing',
    (frequency) => {
      const parsedSources: string[] = []
      const cache = createCodexMarkdownParseCache((source) => {
        parsedSources.push(source)
        return parseCodexMarkdown(source)
      })
      const stablePrefix = `${Array.from(
        { length: 64 },
        (_, index) => `已确认段落 ${index + 1}。`,
      ).join('\n\n')}\n\n`

      cache.render(`${stablePrefix}活跃尾部`, false)
      const parseCountBeforeDeltas = parsedSources.length
      const durations: number[] = []
      for (let index = 0; index < frequency; index += 1) {
        const startedAt = performance.now()
        cache.render(`${stablePrefix}活跃尾部 ${'x'.repeat(index + 1)}`, false)
        durations.push(performance.now() - startedAt)
      }
      const orderedDurations = [...durations].sort(
        (left, right) => left - right,
      )
      const p95Index = Math.min(
        orderedDurations.length - 1,
        Math.ceil(orderedDurations.length * 0.95) - 1,
      )

      expect(
        parsedSources.filter((source) => source === stablePrefix),
      ).toHaveLength(1)
      expect(
        parsedSources
          .slice(parseCountBeforeDeltas)
          .every((source) => source.length < stablePrefix.length),
      ).toBe(true)
      expect(orderedDurations[p95Index]).toBeLessThan(8)
      cache.clear()
    },
  )
})
