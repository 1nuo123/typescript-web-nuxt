<template>
  <EmptyState eyebrow="错误" title="页面未找到" description="页面未找到。">
    <BaseButton @click="navigateTo('/')">返回首页</BaseButton>
  </EmptyState>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'error' })
setResponseStatus(404, 'Not Found')
</script>
