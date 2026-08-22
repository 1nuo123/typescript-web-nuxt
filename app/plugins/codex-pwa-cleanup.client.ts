import {
  buildCodexPwaLegacyCacheMeasurement,
  buildCodexPwaLegacyControllerMeasurement,
  cleanupCodexPwaArtifacts,
  shouldReloadAfterCodexPwaCleanup,
} from '~/utils/codex-pwa-cleanup'

const PWA_CLEANUP_RELOAD_KEY = 'codex-pwa-cleanup-reloaded-v1'

export default defineNuxtPlugin({
  name: 'codex-pwa-cleanup',
  dependsOn: ['codex-client-performance-diagnostics'],
  setup() {
    const performanceDiagnostics = useCodexClientPerformanceDiagnostics()
    // 测试环境和少数受限浏览器不暴露 CacheStorage，不能让退场清理阻断应用初始化。
    if (!('serviceWorker' in navigator) || typeof caches === 'undefined') return
    void cleanupCodexPwaArtifacts(
      navigator.serviceWorker,
      caches,
      window.location.href,
    ).then((result) => {
      const measurement = buildCodexPwaLegacyControllerMeasurement(result)
      if (measurement !== null) performanceDiagnostics.record(measurement)
      const cacheMeasurement = buildCodexPwaLegacyCacheMeasurement(result)
      if (cacheMeasurement !== null)
        performanceDiagnostics.record(cacheMeasurement)
      if (
        shouldReloadAfterCodexPwaCleanup(
          result,
          sessionStorage.getItem(PWA_CLEANUP_RELOAD_KEY) !== null,
        )
      ) {
        sessionStorage.setItem(PWA_CLEANUP_RELOAD_KEY, 'true')
        window.location.reload()
      }
    })
  },
})
