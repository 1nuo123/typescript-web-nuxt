import type {
  ClientDiagnosticEnvelope,
  ClientPerformanceDiagnosticEnvelope,
} from '~/types/app'

/**
 * 诊断传输只持有当前标签页的已尝试事件标识，既不持久化信封也不将失败重新排队。
 * 这条旁路不能成为会话、认证或恢复流程的依赖，也不能把自身失败重新送入运行时日志。
 */
export interface CodexClientDiagnosticTransportOptions {
  enabled: boolean
  hasAccessToken: () => boolean
  postDiagnostic: (envelope: ClientDiagnosticEnvelope) => Promise<unknown>
  postPerformance: (
    envelope: ClientPerformanceDiagnosticEnvelope,
  ) => Promise<unknown>
}

/**
 * 在显式启用且当前内存仍有 access token 时发送一次脱敏诊断信封。
 * 每一个类型和 event id 的组合最多尝试一次；无令牌和网络失败都会被直接丢弃，
 * 因而不会形成离线队列、自动重试或递归错误日志。
 */
export class CodexClientDiagnosticTransport {
  private readonly enabled: boolean
  private readonly hasAccessToken: () => boolean
  private readonly postDiagnostic: (
    envelope: ClientDiagnosticEnvelope,
  ) => Promise<unknown>
  private readonly postPerformance: (
    envelope: ClientPerformanceDiagnosticEnvelope,
  ) => Promise<unknown>
  private readonly attemptedEventKeys = new Set<string>()

  constructor(options: CodexClientDiagnosticTransportOptions) {
    this.enabled = options.enabled
    this.hasAccessToken = options.hasAccessToken
    this.postDiagnostic = options.postDiagnostic
    this.postPerformance = options.postPerformance
  }

  submitDiagnostic(envelope: ClientDiagnosticEnvelope): Promise<boolean> {
    return this.submitOnce(`diagnostic:${envelope.header.event_id}`, () =>
      this.postDiagnostic(envelope),
    )
  }

  submitPerformance(
    envelope: ClientPerformanceDiagnosticEnvelope,
  ): Promise<boolean> {
    return this.submitOnce(`performance:${envelope.header.event_id}`, () =>
      this.postPerformance(envelope),
    )
  }

  /** 页面卸载时释放仅用于幂等投递的内存索引，不留下可恢复的上传状态。 */
  clear(): void {
    this.attemptedEventKeys.clear()
  }

  private async submitOnce(
    eventKey: string,
    post: () => Promise<unknown>,
  ): Promise<boolean> {
    if (!this.enabled || this.attemptedEventKeys.has(eventKey)) return false

    // 在检查令牌前登记本次尝试，令牌稍后出现也不能把旧信封变成待发送队列。
    this.attemptedEventKeys.add(eventKey)
    if (!this.hasAccessToken()) return false

    try {
      await post()
      return true
    } catch {
      // 诊断旁路故障只丢弃本次样本，严禁调用 logger.capture() 造成递归上报。
      return false
    }
  }
}
