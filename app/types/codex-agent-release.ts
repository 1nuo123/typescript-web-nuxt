export const CODEX_AGENT_RELEASE_MANIFEST_KIND = 'codex_agent_release_manifest'
export const CODEX_AGENT_RELEASE_MANIFEST_SCHEMA_VERSION = '1.0'

export interface CodexAgentReleaseManifestHeader {
  kind: typeof CODEX_AGENT_RELEASE_MANIFEST_KIND
  schema_version: typeof CODEX_AGENT_RELEASE_MANIFEST_SCHEMA_VERSION
  channel: 'stable'
}

export interface CodexAgentReleaseDownloadDetail {
  version: string
  download_url: string
  manifest_url: string
  minimum_security_version: string
}

export interface CodexAgentReleaseDownloadEnvelope {
  header: CodexAgentReleaseManifestHeader
  detail: CodexAgentReleaseDownloadDetail
}
