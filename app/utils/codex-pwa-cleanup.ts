import {
  ClientPerformanceMetric,
  ClientPerformanceObservation,
  type ClientPerformanceDiagnosticMeasurement,
} from '../types/app'

/** 一个发布周期内注销旧 PWA Worker 的受控清理规则。 */
export const CODEX_PWA_CACHE_PREFIXES = Object.freeze([
  'workbox-',
  'vite-pwa-',
  'nuxt-pwa-',
] as const)

export interface CodexPwaWorkerRegistration {
  scope: string
  unregister: () => Promise<boolean>
}

export interface CodexPwaWorkerPort {
  controller: object | null
  getRegistrations: () => Promise<readonly CodexPwaWorkerRegistration[]>
}

export interface CodexPwaCachePort {
  keys: () => Promise<readonly string[]>
  delete: (name: string) => Promise<boolean>
}

export interface CodexPwaCleanupResult {
  rootWorkersUnregistered: number
  pwaCachesDeleted: number
  knownPwaCacheDetected: boolean
  controllerStillActive: boolean
}

/**
 * 旧 Worker 在注销后仍可能控制当前页面；同一 session 仅允许刷新一次，避免多标签或异常注册形成刷新循环。
 */
export const shouldReloadAfterCodexPwaCleanup = (
  result: CodexPwaCleanupResult,
  hasReloadedThisSession: boolean,
): boolean =>
  result.rootWorkersUnregistered > 0 &&
  result.controllerStillActive &&
  !hasReloadedThisSession

/** 将仍控制页面的旧 Worker 收敛成一条无路径、无缓存名的固定性能样本。 */
export const buildCodexPwaLegacyControllerMeasurement = (
  result: CodexPwaCleanupResult,
): ClientPerformanceDiagnosticMeasurement | null =>
  result.controllerStillActive
    ? {
        metric: ClientPerformanceMetric.PwaLegacyController,
        observation: ClientPerformanceObservation.LegacyControllerDetected,
        value: 1,
      }
    : null

/** 将清理前发现的已知 PWA 缓存收敛成固定性能样本，不记录缓存名。 */
export const buildCodexPwaLegacyCacheMeasurement = (
  result: CodexPwaCleanupResult,
): ClientPerformanceDiagnosticMeasurement | null =>
  result.knownPwaCacheDetected
    ? {
        metric: ClientPerformanceMetric.PwaLegacyCache,
        observation: ClientPerformanceObservation.LegacyCacheDetected,
        value: 1,
      }
    : null

export const isCodexPwaCacheName = (name: string): boolean =>
  CODEX_PWA_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix))

/**
 * 仅处理同源根 scope Worker 和已知 PWA 前缀缓存，绝不清空整个 origin。
 */
export const cleanupCodexPwaArtifacts = async (
  workerPort: CodexPwaWorkerPort,
  cachePort: CodexPwaCachePort,
  pageUrl: string,
): Promise<CodexPwaCleanupResult> => {
  const pageOrigin = new URL(pageUrl).origin
  const registrations = await workerPort.getRegistrations()
  const unregistered = await Promise.all(
    registrations
      .filter((registration) => {
        const scope = new URL(registration.scope)
        return scope.origin === pageOrigin && scope.pathname === '/'
      })
      .map((registration) => registration.unregister()),
  )
  const cacheNames = await cachePort.keys()
  const knownPwaCacheDetected = cacheNames.some(isCodexPwaCacheName)
  const deleted = await Promise.all(
    cacheNames
      .filter(isCodexPwaCacheName)
      .map((cacheName) => cachePort.delete(cacheName)),
  )
  return {
    rootWorkersUnregistered: unregistered.filter(Boolean).length,
    pwaCachesDeleted: deleted.filter(Boolean).length,
    knownPwaCacheDetected,
    controllerStillActive: workerPort.controller !== null,
  }
}
