import {
  CODEX_DEVICE_CONTRACT_KIND,
  CODEX_DEVICE_CONTRACT_VERSION,
  type DeviceAuthorizationDecideRequestEnvelope,
  type DeviceAuthorizationEnvelope,
  type DeviceAuthorizationRequestHeader,
} from '~/types/codex-device'
import {
  createCodexApiClient,
  createCodexIdempotencyKey,
} from './codex-api-client'

export const CODEX_DEVICE_AUTHORIZATIONS_PATH = '/codex/device-authorizations'

export const createDeviceAuthorizationRequestHeader =
  (): DeviceAuthorizationRequestHeader => ({
    kind: CODEX_DEVICE_CONTRACT_KIND,
    schema_version: CODEX_DEVICE_CONTRACT_VERSION,
    request_id: createCodexIdempotencyKey(),
  })

export const createCodexDevicesClient = () => {
  const client = createCodexApiClient()
  return {
    read: (userCode: string) =>
      client.get<DeviceAuthorizationEnvelope>(
        `${CODEX_DEVICE_AUTHORIZATIONS_PATH}/${encodeURIComponent(userCode)}`,
      ),
    decide: (body: DeviceAuthorizationDecideRequestEnvelope) =>
      client.post<DeviceAuthorizationEnvelope>(
        `${CODEX_DEVICE_AUTHORIZATIONS_PATH}/decisions`,
        body,
      ),
  }
}
