import type { CodexAgentReleaseDownloadDetail } from '~/types/codex-agent-release'
import { CodexHostStatus } from '~/types/codex-host'
import {
  DeviceAuthorizationDecision,
  DeviceAuthorizationState,
} from '~/types/codex-device'
import { CodexEnrollmentIntentState } from '~/types/codex-enrollment'
import { normalizeApiError } from '~/utils/errors'

export const useCodexEnrollment = () => {
  const route = useRoute()
  const devicesStore = useCodexDevicesStore()
  const userCode = ref(
    typeof route.query.user_code === 'string' ? route.query.user_code : '',
  )
  const intentId = ref(
    typeof route.query.intent_id === 'string' ? route.query.intent_id : '',
  )
  const showManualFallback = ref(!intentId.value)
  const agentRelease = ref<CodexAgentReleaseDownloadDetail | null>(null)
  const internalReleaseAcknowledged = ref(false)
  const browserOrigin = ref('')
  const hostStatusLoaded = ref(false)
  const ENROLLMENT_POLL_INTERVAL_MS = 1_000
  const ENROLLMENT_POLL_MAXIMUM_ATTEMPTS = 300
  const CONNECTED_WORKSPACE_TIMEOUT_MS = 300_000
  let workspaceWaitInFlight: Promise<void> | null = null
  const flowError = ref('')
  const releaseError = ref('')
  const resumedHostId = ref<string | null>(null)
  let generation = 0
  let launchUri = ''
  let intentExpiresAt = 0
  const restarting = ref(false)
  let connectionWaitAbort = new AbortController()
  let pollingStopped = false
  let pollingTimer: ReturnType<typeof setTimeout> | null = null
  let resolvePoll: (() => void) | null = null

  const fallbackVerificationUrl = computed(() => {
    const normalizedCode = userCode.value.trim().toUpperCase()
    if (!browserOrigin.value || normalizedCode.length < 6) return ''
    const url = new URL('/codex/verify-device', browserOrigin.value)
    url.searchParams.set('user_code', normalizedCode)
    return url.toString()
  })

  const connectedHost = computed(
    () =>
      devicesStore.hosts.find(
        (host) =>
          host.status === CodexHostStatus.Online &&
          host.host_id ===
            (resumedHostId.value ?? devicesStore.verification?.hostId),
      ) ?? null,
  )

  const isInternalRelease = computed(
    () =>
      !!agentRelease.value?.download_url &&
      agentRelease.value.distribution_mode === 'internal',
  )

  const canDownloadAgent = computed(
    () =>
      Boolean(agentRelease.value?.download_url) &&
      (!isInternalRelease.value || internalReleaseAcknowledged.value),
  )

  const resultLabel = computed(() => {
    const state = devicesStore.verification?.state
    if (state === DeviceAuthorizationState.Approved)
      return '电脑已批准，正在启动助手并同步项目'
    if (state === DeviceAuthorizationState.Denied) return '电脑已拒绝'
    if (state === DeviceAuthorizationState.Expired) return '授权已过期'
    return '授权状态已更新'
  })

  const resultVariant = computed<'success' | 'warning' | 'danger'>(() => {
    const state = devicesStore.verification?.state
    if (state === DeviceAuthorizationState.Approved) return 'success'
    if (state === DeviceAuthorizationState.Expired) return 'warning'
    return 'danger'
  })

  const readAuthorization = async () => {
    flowError.value = ''
    try {
      await devicesStore.readAuthorization(userCode.value)
      if (
        devicesStore.verification?.state === DeviceAuthorizationState.Approved
      )
        await waitForConnectedWorkspace()
    } catch {
      flowError.value =
        devicesStore.errorLabel() || '无法读取授权，请检查用户代码后重试。'
    }
  }

  const decide = async (decision: DeviceAuthorizationDecision) => {
    try {
      await devicesStore.decideAuthorization(decision)
      if (decision === DeviceAuthorizationDecision.Approve)
        await waitForConnectedWorkspace()
    } catch {
      flowError.value = devicesStore.errorLabel() || '授权未完成，请重试。'
    }
  }

  const continueConnection = async (): Promise<void> => {
    if (restarting.value) return
    restarting.value = true
    flowError.value = ''
    try {
      if (
        devicesStore.verification?.state === DeviceAuthorizationState.Approved
      ) {
        await waitForConnectedWorkspace()
        return
      }
      generation += 1
      connectionWaitAbort.abort()
      connectionWaitAbort = new AbortController()
      if (pollingTimer !== null) clearTimeout(pollingTimer)
      resolvePoll?.()
      if (launchUri && Date.now() < intentExpiresAt) {
        window.location.assign(launchUri)
        await pollEnrollmentIntent()
        return
      }
      const enrollment = await new CodexEnrollmentClient().create()
      if (!('launch_uri' in enrollment.detail))
        throw new Error('连接请求未签发')
      intentId.value = enrollment.header.intent_id
      launchUri = enrollment.detail.launch_uri
      intentExpiresAt = Date.parse(enrollment.detail.expires_at)
      await navigateTo(
        { path: route.path, query: { intent_id: intentId.value } },
        { replace: true },
      )
      devicesStore.clearVerification()
      showManualFallback.value = false
      window.location.assign(enrollment.detail.launch_uri)
      await pollEnrollmentIntent()
    } catch {
      flowError.value = '无法继续连接，请重试；跨设备连接可使用用户代码。'
    } finally {
      restarting.value = false
    }
  }

  const downloadAgent = (): void => {
    if (agentRelease.value?.download_url && canDownloadAgent.value)
      window.location.assign(agentRelease.value.download_url)
  }

  const openTasks = async (): Promise<void> => {
    await waitForConnectedWorkspace()
  }

  const waitForConnectedWorkspace = (): Promise<void> => {
    if (workspaceWaitInFlight) return workspaceWaitInFlight
    workspaceWaitInFlight = pollConnectedWorkspace().finally(() => {
      workspaceWaitInFlight = null
    })
    return workspaceWaitInFlight
  }

  const pollConnectedWorkspace = async (): Promise<void> => {
    const sessionStore = useCodexSessionStore()
    const targetHostId =
      resumedHostId.value ?? devicesStore.verification?.hostId
    if (!targetHostId || pollingStopped) return
    const currentGeneration = generation
    const deadline = Date.now() + CONNECTED_WORKSPACE_TIMEOUT_MS
    let online = false
    let lastError = ''
    let selected = false
    while (
      Date.now() < deadline &&
      !pollingStopped &&
      currentGeneration === generation
    ) {
      try {
        if (!selected) {
          await sessionStore.selectHost(targetHostId)
          selected = true
        }
        await sessionStore.loadHosts()
        if (pollingStopped || currentGeneration !== generation) return
        online = sessionStore.hosts.some(
          (host) =>
            host.host_id === targetHostId &&
            host.status === CodexHostStatus.Online,
        )
        const host = sessionStore.hosts.find(
          (host) => host.host_id === targetHostId,
        )
        if (host?.doctor.issue_codes.includes('cli_not_found')) {
          flowError.value =
            '电脑已连接，但未找到本机 Codex。请在连接助手中选择已安装的程序。'
          return
        }
        if (host?.doctor.issue_codes.includes('app_server_start_failed')) {
          flowError.value =
            '电脑已连接，本机 Codex 暂时无法启动。助手会自动重试，也可打开本机诊断查看原因。'
          return
        }
        if (host?.status === CodexHostStatus.Incompatible) {
          flowError.value =
            '电脑已连接，当前 Codex 版本尚未适配。助手更新后可继续，无需重新绑定。'
          return
        }
        if (host?.status === CodexHostStatus.Revoked) {
          flowError.value = '这台电脑的授权已撤销，请重新连接并授权。'
          return
        }
        if (online) {
          await sessionStore.loadWorkspaces()
          if (pollingStopped) return
          if (sessionStore.selectedWorkspaceId) {
            await navigateTo({
              path: '/codex/tasks',
              query: {
                hostId: targetHostId,
                workspaceId: sessionStore.selectedWorkspaceId,
              },
            })
            return
          }
        }
        lastError = ''
      } catch (error) {
        if (pollingStopped) return
        const normalized = normalizeApiError(error)
        if ([401, 403].includes(normalized.statusCode)) {
          flowError.value =
            normalized.statusCode === 401
              ? '登录授权已失效，请重新登录。'
              : '请求被拒绝，请核对账号权限或网关策略。'
          return
        }
        if (
          ![
            0, 408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524,
          ].includes(normalized.statusCode)
        ) {
          flowError.value = normalized.message
          return
        }
        lastError =
          '控制面或网关暂时不可达；已保留电脑授权，恢复后点击继续连接。'
      }
      await waitForNextPoll()
    }
    if (!pollingStopped)
      flowError.value =
        lastError ||
        (online
          ? '电脑已上线，但尚未同步项目。请在本机确认目录与执行配置后继续。'
          : '电脑尚未上线。请检查本机 Agent 是否运行及网络状态，无需重新绑定。')
  }

  const waitForNextPoll = async (): Promise<void> => {
    await new Promise<void>((resolve) => {
      resolvePoll = resolve
      pollingTimer = setTimeout(resolve, ENROLLMENT_POLL_INTERVAL_MS)
    })
  }

  const pollEnrollmentIntent = async (): Promise<void> => {
    if (!intentId.value) return
    const client = new CodexEnrollmentClient()
    const currentGeneration = generation
    for (
      let attempt = 0;
      attempt < ENROLLMENT_POLL_MAXIMUM_ATTEMPTS &&
      !pollingStopped &&
      currentGeneration === generation;
      attempt += 1
    ) {
      let enrollment
      try {
        enrollment = await client.read(
          intentId.value,
          connectionWaitAbort.signal,
        )
      } catch (error) {
        if (pollingStopped || currentGeneration !== generation) return
        const normalized = normalizeApiError(error)
        if (
          ![
            0, 408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524,
          ].includes(normalized.statusCode)
        ) {
          flowError.value = normalized.message || '连接请求已失效，请重新连接。'
          return
        }
        flowError.value = '网络暂时中断，正在继续连接。'
        await waitForNextPoll()
        continue
      }
      if (pollingStopped || currentGeneration !== generation) return
      intentExpiresAt = Date.parse(enrollment.detail.expires_at)
      const approved =
        'authorization' in enrollment.detail &&
        enrollment.detail.authorization?.detail.kind === 'status' &&
        enrollment.detail.authorization.detail.state ===
          DeviceAuthorizationState.Approved
      if (
        Date.now() >= intentExpiresAt &&
        !approved &&
        !('host_id' in enrollment.detail && enrollment.detail.host_id)
      ) {
        flowError.value = '连接请求已过期，请重新连接。'
        return
      }
      flowError.value = ''
      if ('host_id' in enrollment.detail && enrollment.detail.host_id) {
        resumedHostId.value = enrollment.detail.host_id
        await waitForConnectedWorkspace()
        return
      }
      if (
        enrollment.detail.state === CodexEnrollmentIntentState.Consumed &&
        'authorization' in enrollment.detail &&
        enrollment.detail.authorization &&
        enrollment.detail.user_code
      ) {
        userCode.value = enrollment.detail.user_code
        devicesStore.setVerificationFromIntent(
          enrollment.detail.user_code,
          enrollment.detail.authorization,
        )
        if (
          devicesStore.verification?.state === DeviceAuthorizationState.Approved
        )
          await waitForConnectedWorkspace()
        else if (
          devicesStore.verification?.state ===
          DeviceAuthorizationState.Approving
        ) {
          await waitForNextPoll()
          continue
        }
        return
      }
      await waitForNextPoll()
    }
    if (!pollingStopped) showManualFallback.value = true
  }

  onMounted(async () => {
    browserOrigin.value = window.location.origin
    const [releaseResult] = await Promise.allSettled([
      new CodexAgentReleaseClient().readCurrent(),
      devicesStore.loadHosts(),
    ])
    if (releaseResult.status === 'fulfilled')
      agentRelease.value = releaseResult.value.detail
    else {
      agentRelease.value = null
      releaseError.value = '安装包信息暂时无法读取，请刷新页面重试。'
    }
    hostStatusLoaded.value = true
    if (connectedHost.value) return
    if (intentId.value) {
      try {
        await pollEnrollmentIntent()
      } catch {
        showManualFallback.value = true
      }
      return
    }
    if (userCode.value.trim()) await readAuthorization()
  })

  onBeforeUnmount(() => {
    pollingStopped = true
    generation += 1
    connectionWaitAbort.abort()
    if (pollingTimer !== null) clearTimeout(pollingTimer)
    resolvePoll?.()
  })

  return {
    devicesStore,
    userCode,
    showManualFallback,
    agentRelease,
    internalReleaseAcknowledged,
    hostStatusLoaded,
    flowError,
    restarting,
    fallbackVerificationUrl,
    connectedHost,
    isInternalRelease,
    canDownloadAgent,
    resultLabel,
    resultVariant,
    readAuthorization,
    decide,
    continueConnection,
    downloadAgent,
    openTasks,
    releaseError,
  }
}
