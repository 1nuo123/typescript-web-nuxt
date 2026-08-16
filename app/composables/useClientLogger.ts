import { RuntimeLogSource, type RuntimeLogEntry } from '~/types/app'

interface CaptureOptions {
  source?: RuntimeLogEntry['source']
  detail?: string
  code?: string
  route?: string
  threadId?: string
  turnId?: string
  itemId?: string
  eventType?: string
  traceId?: string
}

const getMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object') {
    try {
      return JSON.stringify(error)
    } catch {
      return 'Captured non-serializable runtime error.'
    }
  }

  return 'Captured runtime error.'
}

const createLogId = () => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const useClientLogger = () => {
  const logs = useState<RuntimeLogEntry[]>('runtime-logs', () => [])

  const capture = (error: unknown, options: CaptureOptions = {}) => {
    const route = useRoute()
    const routeThreadId =
      typeof route.params.threadId === 'string'
        ? route.params.threadId
        : undefined
    const entry: RuntimeLogEntry = {
      id: createLogId(),
      source: options.source ?? RuntimeLogSource.Manual,
      message: getMessage(error),
      detail: options.detail,
      code: options.code,
      route: options.route ?? route.fullPath,
      threadId: options.threadId ?? routeThreadId,
      turnId: options.turnId,
      itemId: options.itemId,
      eventType: options.eventType,
      traceId: options.traceId,
      createdAt: new Date().toISOString(),
    }

    logs.value = [entry, ...logs.value].slice(0, 20)

    if (import.meta.dev) {
      console.error(`[runtime] ${JSON.stringify(entry)}`)
    }
  }

  const clear = () => {
    logs.value = []
  }

  return {
    logs,
    capture,
    clear,
  }
}
