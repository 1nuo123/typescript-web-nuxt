import { nextTick, onScopeDispose, type Ref } from 'vue'

/** 会话列表更新前的稳定可见锚点。 */
export interface CodexThreadListScrollAnchor {
  threadId: string
  offset: number
}

const THREAD_SELECTOR = '[data-codex-thread-id]'

/** 读取列表顶部第一个仍可见的线程，避免排序更新丢失阅读位置。 */
export const captureCodexThreadListAnchor = (
  container: HTMLElement,
): CodexThreadListScrollAnchor | null => {
  const containerTop = container.getBoundingClientRect().top
  const threads = container.querySelectorAll<HTMLElement>(THREAD_SELECTOR)
  for (const thread of threads) {
    const rect = thread.getBoundingClientRect()
    if (rect.bottom > containerTop) {
      const threadId = thread.dataset.codexThreadId
      if (threadId) return { threadId, offset: rect.top - containerTop }
    }
  }
  return null
}

/** 按稳定线程 ID 补偿排序更新造成的垂直位移。 */
export const restoreCodexThreadListAnchor = (
  container: HTMLElement,
  anchor: CodexThreadListScrollAnchor,
): void => {
  const escapedId =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(anchor.threadId)
      : anchor.threadId.replaceAll('"', '\\"')
  const thread = container.querySelector<HTMLElement>(
    `[data-codex-thread-id="${escapedId}"]`,
  )
  if (!thread) return
  const delta =
    thread.getBoundingClientRect().top -
    container.getBoundingClientRect().top -
    anchor.offset
  if (Math.abs(delta) > 0.5) container.scrollTop += delta
}

/** 管理会话列表排序刷新期间的锚点捕获、单帧恢复和卸载清理。 */
export const useCodexThreadListScrollAnchor = (
  container: Ref<HTMLElement | null>,
) => {
  let anchor: CodexThreadListScrollAnchor | null = null
  let frame: number | null = null

  const capture = (): void => {
    if (container.value) anchor = captureCodexThreadListAnchor(container.value)
  }

  const restore = (): void => {
    if (frame !== null) return
    void nextTick(() => {
      const run = (): void => {
        frame = null
        if (container.value && anchor) {
          restoreCodexThreadListAnchor(container.value, anchor)
        }
        anchor = null
      }
      if (typeof requestAnimationFrame === 'function') {
        frame = requestAnimationFrame(run)
      } else {
        frame = window.setTimeout(run, 0)
      }
    })
  }

  const dispose = (): void => {
    if (frame !== null) {
      if (typeof cancelAnimationFrame === 'function')
        cancelAnimationFrame(frame)
      else window.clearTimeout(frame)
    }
    frame = null
    anchor = null
  }

  onScopeDispose(dispose)

  return { capture, dispose, restore }
}
