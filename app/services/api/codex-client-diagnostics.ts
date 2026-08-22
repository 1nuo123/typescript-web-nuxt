import type { ApiResponseEnvelope, ApiRequestOptions } from '~/types/api'
import type {
  ClientDiagnosticEnvelope,
  ClientDiagnosticReceipt,
  ClientPerformanceDiagnosticEnvelope,
  ClientPerformanceDiagnosticReceipt,
} from '~/types/app'

export const CODEX_CLIENT_DIAGNOSTIC_PATH = '/codex/diagnostics'
export const CODEX_CLIENT_PERFORMANCE_DIAGNOSTIC_PATH =
  '/codex/diagnostics/performance'

const DIAGNOSTIC_REQUEST_OPTIONS: ApiRequestOptions = {
  meta: { skipRefresh: true },
}

/**
 * 构造只使用内存 access token 的脱敏诊断 API 调用。
 * 相对路径交由 useApi 绑定到当前配置的 API origin；skipRefresh 保证失败不会触发认证刷新。
 */
export const createCodexClientDiagnosticsPoster = () => {
  const authStore = useAuthStore()
  const api = useApi({ getToken: () => authStore.accessToken })

  return {
    hasAccessToken: () => Boolean(authStore.accessToken),
    postDiagnostic: (envelope: ClientDiagnosticEnvelope) =>
      api.post<ApiResponseEnvelope<ClientDiagnosticReceipt>>(
        CODEX_CLIENT_DIAGNOSTIC_PATH,
        envelope,
        DIAGNOSTIC_REQUEST_OPTIONS,
      ),
    postPerformance: (envelope: ClientPerformanceDiagnosticEnvelope) =>
      api.post<ApiResponseEnvelope<ClientPerformanceDiagnosticReceipt>>(
        CODEX_CLIENT_PERFORMANCE_DIAGNOSTIC_PATH,
        envelope,
        DIAGNOSTIC_REQUEST_OPTIONS,
      ),
  }
}
