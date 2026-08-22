import {
  ClientDiagnosticSummary,
  RuntimeLogSource,
  type RuntimeLogEntry,
} from '~/types/app'
import { ClientDiagnosticRateLimiter } from '~/utils/client-diagnostic-rate-limiter'

interface CaptureOptions {
  source?: RuntimeLogSource
  code?: string
}

const DEFAULT_CLIENT_DIAGNOSTIC_CODE = 'client.runtime.unclassified'
const CLIENT_DIAGNOSTIC_CODE_PATTERN = /^[a-z][a-z0-9._-]{0,95}$/
const clientDiagnosticRateLimiter = new ClientDiagnosticRateLimiter()

const createLogId = () => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const resolveSummary = (source: RuntimeLogSource): ClientDiagnosticSummary => {
  const summaries: Readonly<Record<RuntimeLogSource, ClientDiagnosticSummary>> =
    {
      [RuntimeLogSource.Vue]: ClientDiagnosticSummary.VueError,
      [RuntimeLogSource.Window]: ClientDiagnosticSummary.WindowError,
      [RuntimeLogSource.Promise]: ClientDiagnosticSummary.PromiseRejection,
      [RuntimeLogSource.Request]: ClientDiagnosticSummary.RequestFailure,
      [RuntimeLogSource.Manual]: ClientDiagnosticSummary.ManualCapture,
    }
  return summaries[source]
}

/** 非法或自由文本错误码统一降级，防止调用方把异常正文放进诊断字段。 */
const resolveDiagnosticCode = (code: string | undefined): string =>
  code && CLIENT_DIAGNOSTIC_CODE_PATTERN.test(code)
    ? code
    : DEFAULT_CLIENT_DIAGNOSTIC_CODE

export const useClientLogger = () => {
  const logs = useState<RuntimeLogEntry[]>('runtime-logs', () => [])

  /**
   * 捕获运行时故障的安全摘要。
   *
   * 原始 error 只用于调用链语义，不读取、不序列化、不写控制台；诊断数据仅保留固定摘要和受限代码。
   */
  const capture = (error: unknown, options: CaptureOptions = {}): boolean => {
    void error
    const source = options.source ?? RuntimeLogSource.Manual
    const code = resolveDiagnosticCode(options.code)
    const fingerprint = `${source}:${code}`
    const subjectId = useAuthStore().principal?.subject_id ?? 'anonymous'
    if (
      !clientDiagnosticRateLimiter.allows(subjectId, fingerprint, Date.now())
    ) {
      return false
    }
    const entry: RuntimeLogEntry = {
      header: {
        kind: 'client_diagnostic',
        schema_version: '1.0',
        event_id: createLogId(),
        source,
        occurred_at: new Date().toISOString(),
      },
      detail: {
        kind: 'client_diagnostic_detail',
        schema_version: '1.0',
        summary: resolveSummary(source),
        error_code: code,
        fingerprint,
      },
    }

    logs.value = [entry, ...logs.value].slice(0, 20)

    if (import.meta.dev) {
      console.error(`[runtime] ${JSON.stringify(entry)}`)
    }
    return true
  }

  const clear = () => {
    logs.value = []
  }

  return {
    logs,
    capture,
    clear,
  }
}
