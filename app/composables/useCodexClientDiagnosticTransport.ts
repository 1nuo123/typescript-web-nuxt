import type { CodexClientDiagnosticTransport } from '~/utils/codex-client-diagnostic-transport'

const transportsByNuxtApp = new WeakMap<
  object,
  CodexClientDiagnosticTransport
>()

/**
 * 将传输器限制在创建它的 Nuxt 应用实例内，不使用 payload、Storage 或跨标签通信保存上传状态。
 */
export const registerCodexClientDiagnosticTransport = (
  nuxtApp: object,
  transport: CodexClientDiagnosticTransport,
): void => {
  transportsByNuxtApp.set(nuxtApp, transport)
}

/** 页面销毁时移除当前应用实例的传输器，防止旧实例继续持有诊断尝试索引。 */
export const releaseCodexClientDiagnosticTransport = (
  nuxtApp: object,
): void => {
  transportsByNuxtApp.delete(nuxtApp)
}

/** 读取当前标签页的诊断旁路；其创建插件是性能采集插件的显式依赖。 */
export const useCodexClientDiagnosticTransport =
  (): CodexClientDiagnosticTransport => {
    const transport = transportsByNuxtApp.get(useNuxtApp())
    if (!transport) {
      throw new Error('Codex client diagnostic transport is unavailable.')
    }
    return transport
  }
