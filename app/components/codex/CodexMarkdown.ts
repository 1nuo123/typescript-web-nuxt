import type { Token } from 'markdown-it'
import {
  Fragment,
  defineComponent,
  h,
  type PropType,
  type VNodeChild,
} from 'vue'
import {
  parseCodexMarkdown,
  sanitizeCodexMarkdownLink,
} from '~/utils/codex-markdown'

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

const findClosingToken = (tokens: Token[], openingIndex: number): number => {
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

const renderTokenSequence = (tokens: Token[]): VNodeChild[] => {
  const nodes: VNodeChild[] = []
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (!token || token.nesting === -1) continue
    if (token.type === 'inline') {
      nodes.push(...renderTokenSequence(token.children ?? []))
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
      nodes.push(
        h('pre', { class: 'codex-markdown-pre' }, [h('code', token.content)]),
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
    const children = renderTokenSequence(tokens.slice(index + 1, closingIndex))
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
    source: {
      type: String as PropType<string>,
      required: true,
    },
  },
  setup(props) {
    return () =>
      h(Fragment, null, renderTokenSequence(parseCodexMarkdown(props.source)))
  },
})
