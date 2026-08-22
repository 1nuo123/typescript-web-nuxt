import type { Token } from 'markdown-it'
import {
  tokenize,
  type ShjLanguage,
  type ShjToken,
} from '@speed-highlight/core'
import {
  Fragment,
  defineComponent,
  h,
  onUnmounted,
  type PropType,
  ref,
  watch,
  type VNodeChild,
} from 'vue'
import {
  createCodexMarkdownParseCache,
  sanitizeCodexMarkdownLink,
  type CodexMarkdownTokens,
} from '~/utils/codex-markdown'
import {
  ClientPerformanceMetric,
  ClientPerformanceObservation,
} from '~/types/app'
import { Copy, WrapText } from '@lucide/vue'

const SAFE_CONTAINER_TAGS = new Set([
  'p',
  'blockquote',
  'ul',
  'ol',
  'li',
  'em',
  'strong',
  's',
])

interface CodexMarkdownRenderOptions {
  copySource: string | null
  streaming: boolean
  wrappedCodeBlockIndexes: ReadonlySet<number>
  onCopyCodeBlock: (source: string) => void
  onToggleCodeBlockWrap: (index: number) => void
}

interface CodexHighlightedCodeSegment {
  content: string
  tokenType: ShjToken | null
}

const CODEX_CODE_LANGUAGE_ALIASES: Readonly<Record<string, ShjLanguage>> = {
  bash: 'bash',
  c: 'c',
  css: 'css',
  diff: 'diff',
  dockerfile: 'docker',
  go: 'go',
  html: 'html',
  javascript: 'js',
  js: 'js',
  json: 'json',
  markdown: 'md',
  md: 'md',
  python: 'py',
  py: 'py',
  rust: 'rs',
  rs: 'rs',
  shell: 'bash',
  sh: 'bash',
  sql: 'sql',
  toml: 'toml',
  ts: 'ts',
  typescript: 'ts',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
}

/** 仅接受 fence 首个语言标记，禁止把后续元信息传给高亮器。 */
const resolveCodexCodeLanguage = (info: string): ShjLanguage | null => {
  const language = info.trim().split(/\s+/, 1)[0]?.toLocaleLowerCase()
  return language ? (CODEX_CODE_LANGUAGE_ALIASES[language] ?? null) : null
}

const createPlainCodeSegments = (
  source: string,
): CodexHighlightedCodeSegment[] => [{ content: source, tokenType: null }]

/** 高亮器只返回受控 token；代码文本始终作为 VNode 子节点写入，绝不注入 HTML。 */
const tokenizeCodexCode = async (
  source: string,
  language: ShjLanguage | null,
): Promise<CodexHighlightedCodeSegment[]> => {
  if (!language) return createPlainCodeSegments(source)
  const segments: CodexHighlightedCodeSegment[] = []
  try {
    await tokenize(source, language, (content, tokenType) => {
      if (!content) return
      segments.push({ content, tokenType: tokenType ?? null })
    })
  } catch {
    return createPlainCodeSegments(source)
  }
  return segments.length ? segments : createPlainCodeSegments(source)
}

/**
 * 高亮属于展示增强而非流式内容正确性的一部分。流式时必须保持纯文本，避免每个
 * delta 触发词法分析；终态再异步补齐 token，且过期任务不可覆盖新版本代码。
 */
const CodexHighlightedCode = defineComponent({
  name: 'CodexHighlightedCode',
  props: {
    info: {
      required: true,
      type: String as PropType<string>,
    },
    source: {
      required: true,
      type: String as PropType<string>,
    },
    streaming: {
      required: true,
      type: Boolean,
    },
  },
  setup(props) {
    const segments = ref<CodexHighlightedCodeSegment[]>(
      createPlainCodeSegments(props.source),
    )
    let renderGeneration = 0

    watch(
      () => [props.source, props.info, props.streaming] as const,
      async ([source, info, streaming]) => {
        const generation = renderGeneration + 1
        renderGeneration = generation
        if (streaming) {
          segments.value = createPlainCodeSegments(source)
          return
        }
        const highlighted = await tokenizeCodexCode(
          source,
          resolveCodexCodeLanguage(info),
        )
        if (generation === renderGeneration) segments.value = highlighted
      },
      { immediate: true },
    )

    onUnmounted(() => {
      renderGeneration += 1
      segments.value = []
    })

    return () =>
      h(
        'code',
        {
          class: props.streaming
            ? 'codex-markdown-code-streaming'
            : 'codex-markdown-code-highlighted',
        },
        segments.value.map((segment) =>
          segment.tokenType
            ? h(
                'span',
                { class: `codex-markdown-highlight-${segment.tokenType}` },
                segment.content,
              )
            : segment.content,
        ),
      )
  },
})

const copyCodexMarkdownText = (source: string): void => {
  // Clipboard 权限被拒绝时不升级为错误状态，正文仍只停留在当前渲染树和系统剪贴板。
  void navigator.clipboard?.writeText(source).catch(() => undefined)
}

const findClosingToken = (
  tokens: readonly Token[],
  openingIndex: number,
): number => {
  const opening = tokens[openingIndex]
  if (!opening) return openingIndex
  const closingType = opening.type.replace('_open', '_close')
  let depth = 1
  for (let index = openingIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token?.type === opening.type) depth += 1
    if (token?.type === closingType) depth -= 1
    if (depth === 0) return index
  }
  return tokens.length
}

const renderTokenSequence = (
  tokens: readonly Token[],
  options: CodexMarkdownRenderOptions,
): VNodeChild[] => {
  const nodes: VNodeChild[] = []
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (!token || token.nesting === -1) continue
    if (token.type === 'inline') {
      nodes.push(...renderTokenSequence(token.children ?? [], options))
      continue
    }
    if (token.type === 'text' || token.type.startsWith('html_')) {
      nodes.push(token.content)
      continue
    }
    if (token.type === 'softbreak' || token.type === 'hardbreak') {
      nodes.push(h('br'))
      continue
    }
    if (token.type === 'code_inline') {
      nodes.push(h('code', { class: 'codex-markdown-code' }, token.content))
      continue
    }
    if (token.type === 'fence' || token.type === 'code_block') {
      const codeBlockIndex = index
      const isWrapped = options.wrappedCodeBlockIndexes.has(codeBlockIndex)
      nodes.push(
        h('section', { class: 'codex-markdown-code-block' }, [
          h('div', { class: 'codex-markdown-code-actions' }, [
            h(
              'button',
              {
                'aria-label': '复制代码',
                class: 'codex-markdown-code-action',
                title: '复制代码',
                type: 'button',
                onClick: () => options.onCopyCodeBlock(token.content),
              },
              [h(Copy, { 'aria-hidden': 'true', class: 'size-3.5' })],
            ),
            h(
              'button',
              {
                'aria-label': isWrapped ? '关闭代码换行' : '开启代码换行',
                'aria-pressed': isWrapped,
                class: 'codex-markdown-code-action',
                title: isWrapped ? '关闭代码换行' : '开启代码换行',
                type: 'button',
                onClick: () => options.onToggleCodeBlockWrap(codeBlockIndex),
              },
              [h(WrapText, { 'aria-hidden': 'true', class: 'size-3.5' })],
            ),
          ]),
          h(
            'pre',
            {
              class: [
                'codex-markdown-pre',
                isWrapped ? 'codex-markdown-pre-wrapped' : '',
              ],
            },
            [
              h(CodexHighlightedCode, {
                info: token.info,
                source: token.content,
                streaming: options.streaming,
              }),
            ],
          ),
        ]),
      )
      continue
    }
    if (token.type === 'image') {
      nodes.push(token.content || token.attrGet('alt') || '[图片]')
      continue
    }
    if (token.nesting !== 1) {
      if (token.content) nodes.push(token.content)
      continue
    }

    const closingIndex = findClosingToken(tokens, index)
    const children = renderTokenSequence(
      tokens.slice(index + 1, closingIndex),
      options,
    )
    if (token.type === 'link_open') {
      const href = sanitizeCodexMarkdownLink(token.attrGet('href'))
      nodes.push(
        href
          ? h(
              'a',
              {
                href,
                rel: 'nofollow noopener noreferrer',
                target: '_blank',
              },
              children,
            )
          : h('span', children),
      )
    } else if (token.type === 'heading_open') {
      nodes.push(h('strong', { class: 'codex-markdown-heading' }, children))
    } else {
      const tag = SAFE_CONTAINER_TAGS.has(token.tag) ? token.tag : 'span'
      nodes.push(h(tag, children))
    }
    index = closingIndex
  }
  return nodes
}

export default defineComponent({
  name: 'CodexMarkdown',
  props: {
    copyable: {
      default: false,
      type: Boolean,
    },
    source: {
      type: String as PropType<string>,
      required: true,
    },
    streaming: {
      default: false,
      type: Boolean,
    },
  },
  setup(props) {
    const cache = createCodexMarkdownParseCache()
    const performanceDiagnostics = useCodexClientPerformanceDiagnostics()
    const parsedTokens = ref<CodexMarkdownTokens>(Object.freeze([]))
    const wrappedCodeBlockIndexes = ref<ReadonlySet<number>>(new Set())

    /** 流式时只重解析可变尾部；终态统一改用规范化完整结果。 */
    watch(
      () => [props.source, props.streaming] as const,
      ([source, streaming]) => {
        const parsingStartedAt = performance.now()
        parsedTokens.value = cache.render(source, !streaming).tokens
        performanceDiagnostics.record({
          metric: ClientPerformanceMetric.MarkdownDurationMilliseconds,
          observation: ClientPerformanceObservation.Observed,
          value: performance.now() - parsingStartedAt,
        })
      },
      { immediate: true },
    )

    const toggleCodeBlockWrap = (index: number): void => {
      const nextIndexes = new Set(wrappedCodeBlockIndexes.value)
      if (nextIndexes.has(index)) nextIndexes.delete(index)
      else nextIndexes.add(index)
      wrappedCodeBlockIndexes.value = nextIndexes
    }

    onUnmounted(() => {
      // 时间线项随线程卸载时立即丢弃正文 Token，避免跨线程保留 parser cache。
      cache.clear()
      wrappedCodeBlockIndexes.value = new Set()
    })

    return () => {
      const options: CodexMarkdownRenderOptions = {
        copySource: props.copyable ? props.source : null,
        streaming: props.streaming,
        wrappedCodeBlockIndexes: wrappedCodeBlockIndexes.value,
        onCopyCodeBlock: copyCodexMarkdownText,
        onToggleCodeBlockWrap: toggleCodeBlockWrap,
      }
      const renderedTokens = renderTokenSequence(parsedTokens.value, options)
      const fullCopyControl = options.copySource
        ? h(
            'button',
            {
              'aria-label': '复制完整 Markdown',
              class: 'codex-markdown-copy-action',
              title: '复制完整 Markdown',
              type: 'button',
              onClick: () => copyCodexMarkdownText(options.copySource ?? ''),
            },
            [h(Copy, { 'aria-hidden': 'true', class: 'size-3.5' })],
          )
        : null
      return h(Fragment, null, [...renderedTokens, fullCopyControl])
    }
  },
})
