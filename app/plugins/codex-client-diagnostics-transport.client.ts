import { createCodexClientDiagnosticsPoster } from '~/services/api/codex-client-diagnostics'
import { CodexClientDiagnosticTransport } from '~/utils/codex-client-diagnostic-transport'

/**
 * 为当前浏览器标签建立默认关闭的诊断旁路。
 * 仅使用相对 API 路径和内存 access token；useApi 会将请求绑定到配置的 API origin，
 * 而失败由传输器静默丢弃，避免诊断干扰认证刷新、会话发送或页面错误边界。
 */
export default defineNuxtPlugin({
  name: 'codex-client-diagnostics-transport',
  setup(nuxtApp) {
    const runtimeConfig = useRuntimeConfig()
    const poster = createCodexClientDiagnosticsPoster()
    const transport = new CodexClientDiagnosticTransport({
      enabled: runtimeConfig.public.codexDiagnosticsUploadEnabled,
      hasAccessToken: poster.hasAccessToken,
      postDiagnostic: poster.postDiagnostic,
      postPerformance: poster.postPerformance,
    })
    registerCodexClientDiagnosticTransport(nuxtApp, transport)
    const logger = useClientLogger()
    const stopWatchingLogs = watch(
      logger.logs,
      (entries) => {
        // 测试隔离或应用卸载可先删除 useState 值；缺少内存日志时没有任何待传输内容。
        if (!Array.isArray(entries)) return
        for (const entry of entries) void transport.submitDiagnostic(entry)
      },
      { immediate: true },
    )
    const dispose = () => {
      stopWatchingLogs()
      transport.clear()
      releaseCodexClientDiagnosticTransport(nuxtApp)
    }
    window.addEventListener('pagehide', dispose, { once: true })
  },
})
