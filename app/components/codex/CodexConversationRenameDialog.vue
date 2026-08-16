<template>
  <BaseModal :open="open" title="重命名会话" size="sm" @close="close">
    <form class="grid gap-4" @submit.prevent="submit">
      <BaseInput v-model="displayName" label="会话标题" maxlength="256" />
      <AppAlert
        v-if="errorMessage"
        variant="danger"
        title="重命名失败"
        :description="errorMessage"
      />
      <div class="flex justify-end gap-2">
        <BaseButton type="button" variant="secondary" @click="close">
          取消
        </BaseButton>
        <BaseButton type="submit" :disabled="submitting || !displayName.trim()">
          {{ submitting ? '保存中…' : '保存' }}
        </BaseButton>
      </div>
    </form>
  </BaseModal>
</template>

<script setup lang="ts">
import type { CodexThread } from '~/types/codex-thread'
import { normalizeApiError } from '~/utils/errors'

const props = defineProps<{
  open: boolean
  thread: CodexThread | null
}>()

const emit = defineEmits<{
  close: []
}>()

const sessionStore = useCodexSessionStore()
const displayName = ref('')
const submitting = ref(false)
const errorMessage = ref('')

watch(
  () => [props.open, props.thread] as const,
  ([open, thread]) => {
    if (!open || !thread) return
    displayName.value = thread.display_name
    errorMessage.value = ''
  },
  { immediate: true },
)

const close = (): void => {
  if (submitting.value) return
  errorMessage.value = ''
  emit('close')
}

const submit = async (): Promise<void> => {
  const thread = props.thread
  const normalizedTitle = displayName.value.trim()
  if (!thread || !normalizedTitle) return
  submitting.value = true
  errorMessage.value = ''
  try {
    await sessionStore.renameThread(thread, normalizedTitle)
    emit('close')
  } catch (error) {
    errorMessage.value = normalizeApiError(error).message
  } finally {
    submitting.value = false
  }
}
</script>
