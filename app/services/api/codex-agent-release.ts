import type { CodexAgentReleaseDownloadEnvelope } from '~/types/codex-agent-release'

export const CODEX_AGENT_RELEASE_CURRENT_PATH = '/codex/agent-release/current'

export class CodexAgentReleaseClient {
  private readonly client = createCodexApiClient()

  readCurrent(): Promise<CodexAgentReleaseDownloadEnvelope> {
    return this.client.get<CodexAgentReleaseDownloadEnvelope>(
      CODEX_AGENT_RELEASE_CURRENT_PATH,
    )
  }
}
