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

export const sanitizeCodexMarkdownLink = (
  value: string | number | null,
): string | null => {
  if (typeof value !== 'string' || !value) return null
  return /^(?:https?:|mailto:)/i.test(value) ? value : null
}
