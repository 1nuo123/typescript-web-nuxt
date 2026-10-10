export const CODEX_AGENT_RELEASE_MANIFEST_KIND = 'codex_agent_release_manifest'
export const CODEX_AGENT_RELEASE_MANIFEST_SCHEMA_VERSION = '1.0'

/** 下载入口的完整性与自动更新保障等级，由后端配置而不是页面推断。 */
export type CodexAgentReleaseDistributionMode = 'verified' | 'internal'

export interface CodexAgentReleaseManifestHeader {
  kind: typeof CODEX_AGENT_RELEASE_MANIFEST_KIND
  schema_version: typeof CODEX_AGENT_RELEASE_MANIFEST_SCHEMA_VERSION
  channel: 'stable'
}

export interface CodexAgentReleaseDownloadDetail {
  version: string
  distribution_mode: CodexAgentReleaseDistributionMode
  artifact_sha256: string
  download_url: string | null
  manifest_url: string | null
  minimum_security_version: string
  automatic_updates_enabled: boolean
}

export interface CodexAgentReleaseDownloadEnvelope {
  header: CodexAgentReleaseManifestHeader
  detail: CodexAgentReleaseDownloadDetail
}
