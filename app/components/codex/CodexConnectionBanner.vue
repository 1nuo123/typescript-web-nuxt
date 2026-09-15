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
  lastClose?: {
    code: number
    wasClean: boolean
    reason: string | null
    occurredAt: number
    durationMs: number | null
  } | null
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
    const close = props.lastClose
    return close
      ? `正在重新连接（第 ${props.reconnectAttempt ?? 1} 次，连接代码 ${close.code}）…`
      : `正在重新连接（第 ${props.reconnectAttempt ?? 1} 次）…`
  }
  if (props.status === CodexRealtimeConnectionStatus.Resyncing) {
    return '正在同步权威状态，暂时冻结写入。'
  }
  if (props.status === CodexRealtimeConnectionStatus.AuthBlocked) {
    return '登录状态已失效，请重新登录。'
  }
  return '正在连接本机 Codex…'
})
</script>
