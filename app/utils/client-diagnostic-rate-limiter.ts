/** 客户端诊断限流窗口的默认上限，按主体和错误指纹隔离。 */
export const CLIENT_DIAGNOSTIC_RATE_LIMIT_PER_MINUTE = 20
export const CLIENT_DIAGNOSTIC_RATE_LIMIT_WINDOW_MILLISECONDS = 60_000

interface ClientDiagnosticRateLimitBucket {
  startedAt: number
  count: number
}

/**
 * 仅驻留在当前标签页内的诊断限流器。
 *
 * 不把主体标识写入诊断载荷或持久化存储；主体标识只用于内存中隔离限流窗口。
 */
export class ClientDiagnosticRateLimiter {
  private readonly buckets = new Map<string, ClientDiagnosticRateLimitBucket>()

  /** 判断当前事件是否还处于主体与指纹各自的每分钟配额内。 */
  allows(subjectId: string, fingerprint: string, now: number): boolean {
    const key = `${subjectId}:${fingerprint}`
    const existing = this.buckets.get(key)
    if (
      !existing ||
      now - existing.startedAt >=
        CLIENT_DIAGNOSTIC_RATE_LIMIT_WINDOW_MILLISECONDS
    ) {
      this.buckets.set(key, { startedAt: now, count: 1 })
      return true
    }
    if (existing.count >= CLIENT_DIAGNOSTIC_RATE_LIMIT_PER_MINUTE) return false
    existing.count += 1
    return true
  }
}
