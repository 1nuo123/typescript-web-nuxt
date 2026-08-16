<template>
  <div
    v-if="status !== CodexRealtimeConnectionStatus.Connected"
    class="fixed top-3 left-1/2 z-50 w-[min(92vw,42rem)] -translate-x-1/2 rounded-md border border-warning/25 bg-warning-soft px-4 py-2.5 text-center text-sm text-warning shadow-pop"
    role="status"
  >
    {{ message }}
  </div>
</template>

<script setup lang="ts">
import { CodexRealtimeConnectionStatus } from '~/types/codex-realtime'

const props = defineProps<{
  status: CodexRealtimeConnectionStatus
  reconnectAttempt?: number
  error?: string | null
}>()

const message = computed(() => {
  if (props.error) return props.error
  if (props.status === CodexRealtimeConnectionStatus.Offline) {
    return '网络已断开；本机会话会继续，联网后自动恢复权威状态。'
  }
  if (props.status === CodexRealtimeConnectionStatus.Incompatible) {
    return '实时协议不兼容，请刷新客户端或检查服务端版本。'
  }
  if (props.status === CodexRealtimeConnectionStatus.Reconnecting) {
    return `正在重新连接（第 ${props.reconnectAttempt ?? 1} 次）…`
  }
  return '正在连接本机 Codex…'
})
</script>
