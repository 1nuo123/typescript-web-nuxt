import type { ApiRequestOptions, ApiResponseEnvelope } from '~/types/api'
import { ApiAuthStrategy } from '~/types/api'
import type {
  AuthStepUpPurpose,
  AuthenticatedPrincipal,
  BrowserTokenIssuePayload,
  TokenRevokePayload,
  StepUpGrantPayload,
  UserRegistrationPayload,
  UserRegistrationRequest,
} from '~/types/auth'
import {
  AUTH_ME_PATH,
  AUTH_BROWSER_REFRESH_PATH,
  AUTH_BROWSER_REVOKE_PATH,
  AUTH_BROWSER_TOKEN_PATH,
  AUTH_REGISTER_PATH,
  AUTH_STEP_UP_PATH,
} from '~/types/auth'
import { unwrapResponseEnvelope } from './envelope'

export const createAuthClient = () => {
  const api = useApi()
  const authenticatedApi = useAuthenticatedApi()

  return {
    async register(username: string, password: string) {
      const request = { username, password } satisfies UserRegistrationRequest
      const envelope = await api.post<
        ApiResponseEnvelope<UserRegistrationPayload>
      >(AUTH_REGISTER_PATH, request, {
        meta: { authStrategy: ApiAuthStrategy.Public },
      })

      return unwrapResponseEnvelope(envelope)
    },

    async token(username: string, password: string) {
      const envelope = await api.post<
        ApiResponseEnvelope<BrowserTokenIssuePayload>
      >(
        AUTH_BROWSER_TOKEN_PATH,
        { username, password },
        {
          credentials: 'include',
          meta: { authStrategy: ApiAuthStrategy.Public },
        },
      )

      return unwrapResponseEnvelope(envelope)
    },

    async refresh() {
      const envelope = await api.post<
        ApiResponseEnvelope<BrowserTokenIssuePayload>
      >(AUTH_BROWSER_REFRESH_PATH, undefined, {
        credentials: 'include',
        meta: { authStrategy: ApiAuthStrategy.Public },
      })

      return unwrapResponseEnvelope(envelope)
    },

    async revoke() {
      const envelope = await api.post<ApiResponseEnvelope<TokenRevokePayload>>(
        AUTH_BROWSER_REVOKE_PATH,
        undefined,
        {
          credentials: 'include',
          meta: { authStrategy: ApiAuthStrategy.Public },
        },
      )

      return unwrapResponseEnvelope(envelope)
    },

    async me(options: ApiRequestOptions = {}) {
      const envelope = await authenticatedApi.get<
        ApiResponseEnvelope<AuthenticatedPrincipal>
      >(AUTH_ME_PATH, options)

      return unwrapResponseEnvelope(envelope)
    },

    async stepUp(password: string, purpose: AuthStepUpPurpose) {
      const envelope = await authenticatedApi.post<
        ApiResponseEnvelope<StepUpGrantPayload>
      >(AUTH_STEP_UP_PATH, {
        password,
        purpose,
      })
      return unwrapResponseEnvelope(envelope)
    },
  }
}
