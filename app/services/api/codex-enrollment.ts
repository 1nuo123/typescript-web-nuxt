import {
  CODEX_ENROLLMENT_INTENT_KIND,
  CODEX_ENROLLMENT_INTENT_SCHEMA_VERSION,
  type CodexEnrollmentIntentCreateRequestEnvelope,
  type CodexEnrollmentIntentEnvelope,
  type CodexEnrollmentIntentRequestHeader,
} from '~/types/codex-enrollment'

export const CODEX_ENROLLMENT_INTENTS_PATH = '/codex/enrollment-intents'

export class CodexEnrollmentClient {
  private readonly client = createCodexApiClient()

  create(): Promise<CodexEnrollmentIntentEnvelope> {
    const request: CodexEnrollmentIntentCreateRequestEnvelope = {
      header: this.buildRequestHeader(),
      detail: { return_path: '/codex/verify-device' },
    }
    return this.client.post<CodexEnrollmentIntentEnvelope>(
      CODEX_ENROLLMENT_INTENTS_PATH,
      request,
    )
  }

  read(intentId: string): Promise<CodexEnrollmentIntentEnvelope> {
    return this.client.get<CodexEnrollmentIntentEnvelope>(
      `${CODEX_ENROLLMENT_INTENTS_PATH}/${encodeURIComponent(intentId)}`,
    )
  }

  private buildRequestHeader(): CodexEnrollmentIntentRequestHeader {
    return {
      kind: CODEX_ENROLLMENT_INTENT_KIND,
      schema_version: CODEX_ENROLLMENT_INTENT_SCHEMA_VERSION,
      request_id: createCodexIdempotencyKey(),
    }
  }
}
