<template>
  <section
    v-if="descriptor && descriptor.availability !== 'inline'"
    class="mt-2 min-w-0 text-xs text-ink-muted"
  >
    <div class="flex flex-wrap items-center gap-3">
      <span v-if="descriptor.total_bytes != null">{{
        formatBytes(descriptor.total_bytes)
      }}</span>
      <button
        v-if="descriptor.availability === 'readable'"
        type="button"
        class="font-medium hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        :aria-expanded="Boolean(viewKey)"
        @click="toggle"
      >
        {{ viewKey ? '收起正文' : '展开正文' }}
      </button>
      <button
        v-else
        type="button"
        class="font-medium hover:text-ink"
        :disabled="reloading"
        @click="reload"
      >
        重新加载正文
      </button>
    </div>
    <p v-if="reloadError" class="mt-2" role="status">{{ reloadError }}</p>
    <div v-if="view" class="mt-2 grid min-w-0 gap-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span
          >已加载字节 {{ view.chunks[0]?.offset ?? 0 }}–{{ view.nextOffset
          }}{{ view.eof ? ' · 已到末尾' : '' }}</span
        >
        <button
          v-if="view.chunks.length"
          type="button"
          class="hover:text-ink"
          @click="copyLoaded"
        >
          {{ copied ? '已复制' : '复制已加载片段' }}
        </button>
      </div>
      <div
        class="max-h-80 overflow-auto rounded-md border border-line bg-surface-muted p-3 text-sm leading-6 text-ink"
        tabindex="0"
        aria-label="已加载正文片段"
      >
        <pre
          v-for="chunk in view.chunks"
          :key="chunk.offset"
          class="m-0 whitespace-pre-wrap break-words font-mono"
          >{{ chunk.text }}</pre
        >
      </div>
      <p v-if="view.error" class="m-0" role="status">{{ view.error }}</p>
      <button
        v-if="view.expired"
        type="button"
        class="justify-self-start font-medium hover:text-ink"
        :disabled="reloading"
        @click="reload"
      >
        重新加载条目
      </button>
      <button
        v-else-if="!view.eof"
        type="button"
        :disabled="view.loading"
        class="justify-self-start font-medium hover:text-ink disabled:opacity-50"
        @click="loadNext"
      >
        {{
          view.loading ? '正在读取…' : view.error ? '重试当前片段' : '继续读取'
        }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { CodexContentDescriptor } from '~/types/codex-content'
import { useCodexContentStore } from '~/stores/codex-content'
import { useCodexSessionStore } from '~/stores/codex-session'

const props = defineProps<{
  descriptor: CodexContentDescriptor
  threadId: string
  itemId: string
}>()
const content = useCodexContentStore()
const session = useCodexSessionStore()
const viewKey = ref<string | null>(null)
const copied = ref(false)
const reloading = ref(false)
const reloadError = ref<string | null>(null)
const view = computed(() =>
  viewKey.value ? content.views[viewKey.value] : null,
)
const formatBytes = (bytes: number): string =>
  bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KiB`
const close = (): void => {
  if (viewKey.value) content.release(viewKey.value)
  viewKey.value = null
  copied.value = false
}
const loadNext = async (): Promise<void> => {
  if (!viewKey.value) return
  await content.readNext(viewKey.value)
  session.evictTimelineBodies([props.itemId])
}
const toggle = async (): Promise<void> => {
  if (viewKey.value) {
    close()
    return
  }
  if (props.descriptor.availability !== 'readable' || !session.selectedHostId)
    return
  viewKey.value = content.acquire(
    session.selectedHostId,
    props.threadId,
    props.itemId,
    props.descriptor,
  )
  if (!view.value?.chunks.length) await loadNext()
}
const reload = async (): Promise<void> => {
  if (reloading.value) return
  close()
  reloading.value = true
  reloadError.value = null
  try {
    await session.reloadTimelineBody(props.itemId)
  } catch {
    reloadError.value = '正文暂时无法重新加载，请稍后重试。'
  } finally {
    reloading.value = false
  }
}
const copyLoaded = async (): Promise<void> => {
  if (!view.value) return
  await navigator.clipboard.writeText(
    view.value.chunks.map((chunk) => chunk.text).join(''),
  )
  copied.value = true
}
watch(
  [
    () => session.selectedHostId,
    () => props.threadId,
    () => props.itemId,
    () => props.descriptor.revision,
    () => props.descriptor.availability,
  ],
  close,
)
watch(view, (current) => {
  if (!current && viewKey.value) close()
})
watch(
  () => props.descriptor,
  (descriptor) => {
    if (viewKey.value && descriptor.availability === 'readable')
      content.refresh(viewKey.value, descriptor)
  },
)
onBeforeUnmount(close)
</script>
