<template>
  <span
    class="inline-flex min-w-0 items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink"
  >
    <span
      class="size-2 shrink-0 rounded-full"
      :class="statusClass"
      aria-hidden="true"
    />
    <span class="truncate">{{ host.display_name }}</span>
    <span v-if="!compact" class="ml-auto shrink-0 text-ink-muted">{{
      statusLabel
    }}</span>
  </span>
</template>

<script setup lang="ts">
import { CodexHostStatus, type CodexHost } from '~/types/codex-host'

const props = withDefaults(
  defineProps<{ host: CodexHost; compact?: boolean }>(),
  {
    compact: false,
  },
)

const statusLabel = computed(() => {
  if (props.host.connected && props.host.status === CodexHostStatus.Offline)
    return '已连接，执行未就绪'
  const labels: Record<string, string> = {
    [CodexHostStatus.Online]: '在线',
    [CodexHostStatus.Offline]: '离线',
    [CodexHostStatus.Incompatible]: '版本不兼容',
    [CodexHostStatus.Revoked]: '已吊销',
    [CodexHostStatus.Enrolling]: '配对中',
  }
  return labels[props.host.status] ?? props.host.status
})

const statusClass = computed(() =>
  props.host.status === CodexHostStatus.Online
    ? 'bg-accent'
    : props.host.status === CodexHostStatus.Incompatible
      ? 'bg-warning'
      : 'bg-danger',
)
</script>
