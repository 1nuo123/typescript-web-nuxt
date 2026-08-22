// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import {
  captureCodexThreadListAnchor,
  restoreCodexThreadListAnchor,
} from '../../app/composables/useCodexThreadListScrollAnchor'

const rect = (top: number, bottom: number): DOMRect =>
  ({
    top,
    bottom,
    left: 0,
    right: 0,
    width: 0,
    height: bottom - top,
  }) as DOMRect

describe('Codex thread list scroll anchor', () => {
  it('captures the first visible thread and restores its offset after reorder', () => {
    const container = document.createElement('div')
    const first = document.createElement('article')
    first.dataset.codexThreadId = 'thread-first'
    const second = document.createElement('article')
    second.dataset.codexThreadId = 'thread-second'
    container.append(first, second)
    container.getBoundingClientRect = () => rect(100, 400)
    first.getBoundingClientRect = () => rect(80, 120)
    second.getBoundingClientRect = () => rect(120, 160)

    const anchor = captureCodexThreadListAnchor(container)

    expect(anchor).toEqual({ threadId: 'thread-first', offset: -20 })

    first.getBoundingClientRect = () => rect(132, 172)
    container.scrollTop = 10
    restoreCodexThreadListAnchor(container, anchor!)

    expect(container.scrollTop).toBe(62)
  })

  it('does not change scroll position when the anchored thread disappeared', () => {
    const container = document.createElement('div')
    const thread = document.createElement('article')
    thread.dataset.codexThreadId = 'thread-current'
    container.append(thread)
    container.getBoundingClientRect = () => rect(0, 300)
    thread.getBoundingClientRect = () => rect(10, 50)

    const anchor = captureCodexThreadListAnchor(container)
    thread.remove()
    container.scrollTop = 7
    restoreCodexThreadListAnchor(container, anchor!)

    expect(container.scrollTop).toBe(7)
  })
})
