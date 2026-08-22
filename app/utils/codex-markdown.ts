import MarkdownIt from 'markdown-it'
import type { Token } from 'markdown-it'

const parser = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: false,
  typographer: false,
})

export const parseCodexMarkdown = (source: string): Token[] =>
  parser.parse(source, {})

/**
 * 仅用于当前时间线项的 Markdown 缓存。Token 在缓存后被冻结，渲染层只能读取，
 * 这样流式增量不会意外修改已确认的稳定前缀。
 */
export type CodexMarkdownTokens = readonly Token[]

/** 流式解析本次采用的路径，供性能观测和确定性测试使用。 */
export type CodexMarkdownParseMode = 'incremental' | 'fallback' | 'canonical'

/** 单次解析结果及可审计的缓存命中信息。 */
export interface CodexMarkdownParseResult {
  mode: CodexMarkdownParseMode
  tokens: CodexMarkdownTokens
  stablePrefixLength: number
  reusedStablePrefix: boolean
  parseCount: number
}

/** 可注入解析器使缓存行为可以不依赖计时器地验证。 */
export type CodexMarkdownParser = (source: string) => Token[]

/**
 * 单个消息实例持有的增量解析缓存。
 *
 * 缓存不写入 Pinia、Storage 或跨标签通道；组件卸载后必须调用 clear，防止正文
 * 在切换线程后继续保留在内存中。
 */
export interface CodexMarkdownParseCache {
  render(source: string, isTerminal: boolean): CodexMarkdownParseResult
  clear(): void
}

interface CodexMarkdownCacheState {
  lastResult: CodexMarkdownParseResult | null
  lastSource: string | null
  parseCount: number
  stableSource: string
  stableTokens: CodexMarkdownTokens
}

interface CodexMarkdownStablePrefix {
  fallbackRequired: boolean
  source: string
}

const LIST_OR_QUOTE_LINE_PATTERN = /^ {0,3}(?:>|[-+*]\s+|\d+[.)]\s+)/
const INDENTED_CODE_LINE_PATTERN = /^ {4}/
const FENCE_LINE_PATTERN = /^ {0,3}(`{3,}|~{3,})[^`~]*$/

const normalizeCodexMarkdownSource = (source: string): string =>
  source.replace(/\r\n?/g, '\n')

/**
 * Markdown-it 的 Token 是可变对象。这里递归冻结 parser 的新输出，避免 Vue 渲染
 * 或后续缓存路径污染已经确认的块；只处理本模块刚生成的普通数据对象。
 */
const freezeCodexMarkdownValue = <T>(value: T): T => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value))
    return value
  for (const nestedValue of Object.values(value)) {
    freezeCodexMarkdownValue(nestedValue)
  }
  return Object.freeze(value)
}

const freezeCodexMarkdownTokens = (tokens: Token[]): CodexMarkdownTokens =>
  freezeCodexMarkdownValue(tokens)

/** 解析子串后需要把 token 的行号恢复到整条消息坐标。 */
const countCodexMarkdownLines = (source: string): number =>
  source.split('\n').length - 1

/**
 * 稳定前缀和活跃尾部会分别送入 Markdown-it。Token.map 是解析输入的相对行号，
 * 因而在合并前必须递归平移；否则后续渲染扩展或调试读取 map 时会看到错误坐标。
 */
const offsetCodexMarkdownTokenLines = (
  tokens: Token[],
  lineOffset: number,
): Token[] => {
  if (lineOffset === 0) return tokens
  return tokens.map((token) => {
    const adjustedToken = Object.assign(
      Object.create(Object.getPrototypeOf(token)),
      token,
    ) as Token
    if (token.map) {
      adjustedToken.map = [token.map[0] + lineOffset, token.map[1] + lineOffset]
    }
    if (token.children) {
      adjustedToken.children = offsetCodexMarkdownTokenLines(
        token.children,
        lineOffset,
      )
    }
    return adjustedToken
  })
}

/**
 * 只将经过空行确认的、没有列表/引用/缩进代码上下文的前缀提升为稳定块。
 *
 * Markdown 的列表和引用可跨空行继续，未闭合 fence 也会改变此前内容的语义。因此
 * 一旦遇到这些结构，宁可完整解析当前消息，也不能拼接出与最终 Markdown 不一致的
 * Token 序列。这个保守边界把正确性置于命中率之上。
 */
const resolveCodexMarkdownStablePrefix = (
  source: string,
): CodexMarkdownStablePrefix => {
  const lines = source.match(/.*(?:\n|$)/g) ?? []
  let fenceMarker: '`' | '~' | null = null
  let fenceLength = 0
  let offset = 0
  let stablePrefixLength = 0

  for (const lineWithEnding of lines) {
    if (!lineWithEnding) continue
    const line = lineWithEnding.endsWith('\n')
      ? lineWithEnding.slice(0, -1)
      : lineWithEnding

    if (fenceMarker) {
      const closingPattern = new RegExp(
        `^ {0,3}${fenceMarker}{${fenceLength},}\\s*$`,
      )
      if (closingPattern.test(line)) {
        fenceMarker = null
        fenceLength = 0
      }
    } else {
      const fence = line.match(FENCE_LINE_PATTERN)
      if (fence?.[1]) {
        fenceMarker = fence[1][0] as '`' | '~'
        fenceLength = fence[1].length
      } else if (
        LIST_OR_QUOTE_LINE_PATTERN.test(line) ||
        INDENTED_CODE_LINE_PATTERN.test(line)
      ) {
        return { fallbackRequired: true, source: '' }
      }
    }

    offset += lineWithEnding.length
    if (!fenceMarker && line.trim() === '') stablePrefixLength = offset
  }

  if (fenceMarker) return { fallbackRequired: true, source: '' }
  return {
    fallbackRequired: false,
    source: source.slice(0, stablePrefixLength),
  }
}

/**
 * 创建一个与单条时间线消息绑定的 Markdown 缓存。
 *
 * 终态强制从完整正文生成规范 Token 并替换增量产物；在任何无法证明安全分块的
 * 流式状态下，完整解析当前消息作为回退。调用方必须在组件卸载时 clear。
 */
export const createCodexMarkdownParseCache = (
  parse: CodexMarkdownParser = parseCodexMarkdown,
): CodexMarkdownParseCache => {
  const state: CodexMarkdownCacheState = {
    lastResult: null,
    lastSource: null,
    parseCount: 0,
    stableSource: '',
    stableTokens: Object.freeze([]),
  }

  const parseTokens = (source: string, lineOffset = 0): CodexMarkdownTokens => {
    state.parseCount += 1
    return freezeCodexMarkdownTokens(
      offsetCodexMarkdownTokenLines(parse(source), lineOffset),
    )
  }

  const publish = (
    mode: CodexMarkdownParseMode,
    tokens: CodexMarkdownTokens,
    stablePrefixLength: number,
    reusedStablePrefix: boolean,
    source: string,
  ): CodexMarkdownParseResult => {
    const result: CodexMarkdownParseResult = Object.freeze({
      mode,
      tokens,
      stablePrefixLength,
      reusedStablePrefix,
      parseCount: state.parseCount,
    })
    state.lastResult = result
    state.lastSource = source
    return result
  }

  return {
    render(source: string, isTerminal: boolean): CodexMarkdownParseResult {
      const normalizedSource = normalizeCodexMarkdownSource(source)
      if (
        state.lastSource === normalizedSource &&
        state.lastResult &&
        (!isTerminal || state.lastResult.mode === 'canonical')
      ) {
        return state.lastResult
      }

      const isAppendOnly =
        state.lastSource === null ||
        normalizedSource.startsWith(state.lastSource)
      if (!isAppendOnly) {
        state.stableSource = ''
        state.stableTokens = Object.freeze([])
      }

      if (isTerminal) {
        const tokens = parseTokens(normalizedSource)
        state.stableSource = normalizedSource
        state.stableTokens = tokens
        return publish(
          'canonical',
          tokens,
          normalizedSource.length,
          false,
          normalizedSource,
        )
      }

      const stablePrefix = resolveCodexMarkdownStablePrefix(normalizedSource)
      if (stablePrefix.fallbackRequired) {
        const tokens = parseTokens(normalizedSource)
        state.stableSource = ''
        state.stableTokens = Object.freeze([])
        return publish('fallback', tokens, 0, false, normalizedSource)
      }

      const previousStableSource = state.stableSource
      const reusedStablePrefix =
        stablePrefix.source.startsWith(previousStableSource)
      if (!reusedStablePrefix) {
        state.stableTokens = parseTokens(stablePrefix.source)
      } else if (stablePrefix.source.length > previousStableSource.length) {
        const stableExtension = stablePrefix.source.slice(
          previousStableSource.length,
        )
        state.stableTokens = freezeCodexMarkdownTokens([
          ...state.stableTokens,
          ...parseTokens(
            stableExtension,
            countCodexMarkdownLines(previousStableSource),
          ),
        ])
      }
      state.stableSource = stablePrefix.source

      const activeSource = normalizedSource.slice(stablePrefix.source.length)
      const activeTokens = activeSource
        ? parseTokens(
            activeSource,
            countCodexMarkdownLines(stablePrefix.source),
          )
        : []
      const tokens = freezeCodexMarkdownTokens([
        ...state.stableTokens,
        ...activeTokens,
      ])
      return publish(
        'incremental',
        tokens,
        stablePrefix.source.length,
        reusedStablePrefix,
        normalizedSource,
      )
    },

    clear(): void {
      state.lastResult = null
      state.lastSource = null
      state.parseCount = 0
      state.stableSource = ''
      state.stableTokens = Object.freeze([])
    },
  }
}

export const sanitizeCodexMarkdownLink = (
  value: string | number | null,
): string | null => {
  if (typeof value !== 'string' || !value) return null
  return /^(?:https?:|mailto:)/i.test(value) ? value : null
}
