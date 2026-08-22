import { ClientPerformanceDiagnosticCollector } from '~/utils/client-performance-diagnostic'
import {
  CodexClientPerformanceMonitor,
  type CodexClientLongTaskObserver,
} from '~/utils/codex-client-performance-monitor'

const createBrowserLongTaskObserver = (
  onLongTask: (durationMilliseconds: number) => void,
): CodexClientLongTaskObserver | null => {
  if (typeof PerformanceObserver === 'undefined') return null
  try {
    const observer = new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) onLongTask(entry.duration)
    })
    observer.observe({ buffered: true, type: 'longtask' })
    return observer
  } catch {
    // 部分浏览器存在 PerformanceObserver 却不支持 longtask，保持诊断降级而非报错。
    return null
  }
}

/**
 * 为当前浏览器标签创建一次匿名性能采样上下文。
 *
 * 该插件只提供内存收集器，不注册网络传输；关闭运行时开关时收集器仍可安全存在，
 * 但不会保留任何样本。匿名键不写入 payload、Storage 或跨标签通信通道。
 */
export default defineNuxtPlugin({
  name: 'codex-client-performance-diagnostics',
  dependsOn: ['codex-client-diagnostics-transport'],
  setup(nuxtApp) {
    const runtimeConfig = useRuntimeConfig()
    const diagnosticTransport = useCodexClientDiagnosticTransport()
    const sessionKey = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const collector = new ClientPerformanceDiagnosticCollector({
      enabled: runtimeConfig.public.codexPerformanceDiagnosticsEnabled,
      sessionKey,
      sampleRate: runtimeConfig.public.codexPerformanceDiagnosticsSampleRate,
      onRecord: (entry) => {
        void diagnosticTransport.submitPerformance(entry)
      },
    })
    const monitor = new CodexClientPerformanceMonitor({
      record: (measurement) => collector.record(measurement),
      requestAnimationFrame: (callback) => requestAnimationFrame(callback),
      cancelAnimationFrame: (requestId) => cancelAnimationFrame(requestId),
      isPageVisible: () => document.visibilityState === 'visible',
      createLongTaskObserver: createBrowserLongTaskObserver,
    })
    monitor.start()
    const stopMonitor = () => monitor.stop()
    const unmount = nuxtApp.vueApp.unmount.bind(nuxtApp.vueApp)
    nuxtApp.vueApp.unmount = () => {
      stopMonitor()
      unmount()
    }
    window.addEventListener('pagehide', stopMonitor, { once: true })

    return {
      provide: {
        codexClientPerformanceDiagnostics: collector,
      },
    }
  },
})
