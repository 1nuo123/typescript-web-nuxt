import { defineStore } from 'pinia'
import type { ApiErrorPayload } from '~/types/api'
import { AuthStepUpPurpose } from '~/types/auth'
import type { CodexHost } from '~/types/codex-host'
import {
  CodexDeviceErrorCode,
  DeviceAuthorizationDecision,
  type DeviceAuthorizationEnvelope,
  type DeviceAuthorizationView,
} from '~/types/codex-device'
import {
  createCodexDevicesClient,
  createDeviceAuthorizationRequestHeader,
} from '~/services/api/codex-devices'
import { createCodexIdempotencyKey } from '~/services/api/codex-api-client'

export const CODEX_HOST_REVOKE_PURPOSE = AuthStepUpPurpose.CodexHostRevoke

interface CodexDevicesStoreState {
  verification: DeviceAuthorizationView | null
  loading: boolean
  lastError: ApiErrorPayload | null
}

const toVerificationView = (
  userCode: string,
  envelope: DeviceAuthorizationEnvelope,
): DeviceAuthorizationView => ({
  hostId: envelope.detail.host_id,
  enrollmentId: envelope.header.enrollment_id,
  userCode,
  state: envelope.detail.state,
  displayName: envelope.detail.display_name,
  platform: envelope.detail.platform,
  fingerprint: envelope.detail.public_key_fingerprint,
  expiresAt: envelope.detail.expires_at,
})

export const useCodexDevicesStore = defineStore('codex-devices', {
  state: (): CodexDevicesStoreState => ({
    verification: null,
    loading: false,
    lastError: null,
  }),
  getters: {
    /** Compatibility selector backed by the session's authoritative host projection. */
    hosts(): CodexHost[] {
      return useCodexSessionStore().hosts
    },
  },
  actions: {
    async loadHosts(): Promise<void> {
      this.loading = true
      this.lastError = null
      try {
        await useCodexSessionStore().loadHosts()
      } catch (error) {
        this.lastError = error as ApiErrorPayload
        throw error
      } finally {
        this.loading = false
      }
    },

    async readAuthorization(
      userCode: string,
    ): Promise<DeviceAuthorizationView> {
      this.loading = true
      this.lastError = null
      try {
        const normalizedCode = userCode.trim().toUpperCase()
        const envelope = await createCodexDevicesClient().read(normalizedCode)
        this.verification = toVerificationView(normalizedCode, envelope)
        return this.verification
      } catch (error) {
        this.lastError = error as ApiErrorPayload
        throw error
      } finally {
        this.loading = false
      }
    },

    setVerificationFromIntent(
      userCode: string,
      envelope: DeviceAuthorizationEnvelope,
    ): DeviceAuthorizationView {
      this.lastError = null
      this.verification = toVerificationView(userCode, envelope)
      return this.verification
    },

    async decideAuthorization(
      decision: DeviceAuthorizationDecision,
    ): Promise<void> {
      if (!this.verification) throw new Error('设备授权尚未读取。')
      this.loading = true
      try {
        const envelope = await createCodexDevicesClient().decide({
          header: createDeviceAuthorizationRequestHeader(),
          detail: {
            enrollment_id: this.verification.enrollmentId,
            user_code: this.verification.userCode,
            decision,
            idempotency_key: createCodexIdempotencyKey(),
          },
        })
        this.verification = toVerificationView(
          this.verification.userCode,
          envelope,
        )
        if (decision === DeviceAuthorizationDecision.Approve) {
          await this.loadHosts()
        }
      } catch (error) {
        this.lastError = error as ApiErrorPayload
        throw error
      } finally {
        this.loading = false
      }
    },

    async renameHost(host: CodexHost, displayName: string): Promise<void> {
      try {
        await createCodexHostsClient().rename(host.host_id, host.version, {
          display_name: displayName.trim(),
        })
        // Mutation responses contain persisted metadata; read the authoritative live projection.
        await useCodexSessionStore().loadHosts()
      } catch (error) {
        const normalized = error as ApiErrorPayload
        this.lastError = normalized
        if (normalized.errorCode === CodexDeviceErrorCode.VersionConflict) {
          await this.loadHosts()
        }
        throw normalized
      }
    },

    async revokeHost(host: CodexHost, password: string): Promise<void> {
      const token = await useAuthStore().issueStepUpGrant(
        password,
        CODEX_HOST_REVOKE_PURPOSE,
      )
      await createCodexHostsClient().revoke(host.host_id, host.version, {
        step_up_token: token,
      })
      useCodexSessionStore().removeHost(host.host_id)
    },

    errorLabel(): string | null {
      const code = this.lastError?.errorCode
      if (!code) return null
      const labels: Partial<Record<CodexDeviceErrorCode, string>> = {
        [CodexDeviceErrorCode.NotFound]: '授权代码不存在',
        [CodexDeviceErrorCode.Expired]: '授权代码已过期',
        [CodexDeviceErrorCode.SlowDown]: '请求过于频繁',
        [CodexDeviceErrorCode.StateConflict]: '授权状态已经变化',
        [CodexDeviceErrorCode.VersionConflict]: '电脑信息已经更新',
      }
      return labels[code as CodexDeviceErrorCode] ?? '设备管理请求失败'
    },

    clearVerification(): void {
      this.verification = null
      this.lastError = null
    },
  },
})
