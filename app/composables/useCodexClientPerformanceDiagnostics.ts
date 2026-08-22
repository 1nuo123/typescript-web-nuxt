import type { ClientPerformanceDiagnosticCollector } from '~/utils/client-performance-diagnostic'

/**
 * 读取当前标签页专属的性能收集器。
 *
 * 收集器由 client-only 插件创建，组件卸载不会向网络或持久化存储转移样本；未来的
 * 传输功能必须单独获得安全审查和显式开关，不能修改此 composable 的只读依赖边界。
 */
export const useCodexClientPerformanceDiagnostics =
  (): ClientPerformanceDiagnosticCollector =>
    useNuxtApp().$codexClientPerformanceDiagnostics
