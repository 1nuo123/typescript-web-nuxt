/** 远程 Codex 高风险体验优化路径的默认关闭开关。 */
export interface CodexExperienceFeatureFlags {
  codex_scroll_controller_v2: boolean
  codex_realtime_batch_v2: boolean
  codex_authority_recovery_v2: boolean
}

/** 默认值保留旧路径，支持按功能独立回退。 */
export const CODEX_EXPERIENCE_FEATURE_FLAG_DEFAULTS: Readonly<CodexExperienceFeatureFlags> =
  Object.freeze({
    codex_scroll_controller_v2: false,
    codex_realtime_batch_v2: false,
    codex_authority_recovery_v2: false,
  })

/** 浏览器诊断上传须由部署环境显式开启，不能随着内存采样自动联网。 */
export const CODEX_CLIENT_DIAGNOSTICS_UPLOAD_DEFAULT_ENABLED = false
