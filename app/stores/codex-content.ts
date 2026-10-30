import { defineStore } from 'pinia'
import { createCodexThreadsClient } from '~/services/api/codex-threads'
import type { CodexReadableContent } from '~/types/codex-content'

const MAX_CONTENT_BYTES = 4 * 1024 * 1024
const MAX_VIEW_BYTES = 256 * 1024
const MAX_READS = 4
interface ContentView {
  hostId: string
  threadId: string
  itemId: string
  descriptor: CodexReadableContent
  chunks: { offset: number; text: string; bytes: number }[]
  nextOffset: number
  bytes: number
  eof: boolean
  loading: boolean
  error: string | null
  expired: boolean
  owners: number
}

export const codexContentKey = (
  hostId: string,
  threadId: string,
  itemId: string,
  descriptor: CodexReadableContent,
): string =>
  JSON.stringify([
    hostId,
    threadId,
    itemId,
    descriptor.field,
    descriptor.revision,
  ])

export const useCodexContentStore = defineStore('codex-content', () => {
  const views = reactive<Record<string, ContentView>>({})
  const controllers = new Map<string, AbortController>()
  const totalBytes = computed(() =>
    Object.values(views).reduce((total, view) => total + view.bytes, 0),
  )

  const acquire = (
    hostId: string,
    threadId: string,
    itemId: string,
    descriptor: CodexReadableContent,
  ): string => {
    const key = codexContentKey(hostId, threadId, itemId, descriptor)
    const existing = views[key]
    if (existing) {
      existing.owners += 1
      return key
    }
    views[key] = {
      hostId,
      threadId,
      itemId,
      descriptor,
      chunks: [],
      nextOffset: 0,
      bytes: 0,
      eof: false,
      loading: false,
      error: null,
      expired: false,
      owners: 1,
    }
    return key
  }
  const refresh = (key: string, descriptor: CodexReadableContent): void => {
    const view = views[key]
    if (view && view.descriptor.revision === descriptor.revision)
      view.descriptor = descriptor
  }
  const release = (key: string): void => {
    const view = views[key]
    if (!view || --view.owners > 0) return
    controllers.get(key)?.abort()
    controllers.delete(key)
    delete views[key]
  }
  const clear = (): void => {
    for (const controller of controllers.values()) controller.abort()
    controllers.clear()
    for (const key of Object.keys(views)) delete views[key]
  }
  const readNext = async (key: string): Promise<void> => {
    const view = views[key]
    if (!view || view.loading || view.eof || view.expired) return
    if (controllers.size >= MAX_READS) {
      view.error = '正在读取其他内容，请稍后重试。'
      return
    }
    const controller = new AbortController()
    controllers.set(key, controller)
    view.loading = true
    view.error = null
    try {
      const chunk = await createCodexThreadsClient().readContent(
        view.hostId,
        view.threadId,
        view.itemId,
        {
          content_ref: view.descriptor.content_ref,
          revision: view.descriptor.revision,
          offset: view.nextOffset,
          requested_bytes: 16384,
        },
        controller.signal,
      )
      if (controller.signal.aborted || views[key] !== view) return
      if (
        chunk.revision !== view.descriptor.revision ||
        chunk.offset !== view.nextOffset
      )
        throw new Error('正文版本已变化，请重新加载条目。')
      const bytes = new TextEncoder().encode(chunk.text).length
      // 仅保存当前阅读窗口；继续读取不会让整个正文驻留内存。
      while (view.chunks.length && view.bytes + bytes > MAX_VIEW_BYTES)
        view.bytes -= view.chunks.shift()!.bytes
      if (totalBytes.value + bytes > MAX_CONTENT_BYTES) {
        view.error = '当前正文缓存已满，请折叠其他正文后继续。'
        return
      }
      view.chunks.push({ offset: chunk.offset, text: chunk.text, bytes })
      view.bytes += bytes
      view.nextOffset = chunk.next_offset
      view.eof = chunk.eof
    } catch (error) {
      if (controller.signal.aborted || views[key] !== view) return
      const status =
        error && typeof error === 'object' && 'statusCode' in error
          ? error.statusCode
          : null
      if (status === 409 || status === 410) {
        view.chunks = []
        view.bytes = 0
        view.expired = true
        view.error = '正文已更新或引用已失效，请重新加载条目。'
      } else
        view.error =
          status === 503
            ? '电脑已离线，可稍后继续读取。'
            : '正文读取未完成，可重试当前片段。'
    } finally {
      if (controllers.get(key) === controller) controllers.delete(key)
      if (views[key] === view) view.loading = false
    }
  }
  return { views, totalBytes, acquire, refresh, release, clear, readNext }
})
