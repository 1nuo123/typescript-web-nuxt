import { RuntimeLogSource, type RuntimeLogEntry } from '~/types/app'

interface CaptureOptions {
  source?: RuntimeLogEntry['source']
  detail?: string
}

const getMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return '已捕获运行时错误。'
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
    const entry: RuntimeLogEntry = {
      id: createLogId(),
      source: options.source ?? RuntimeLogSource.Manual,
      message: getMessage(error),
      detail: options.detail,
      createdAt: new Date().toISOString(),
    }

    logs.value = [entry, ...logs.value].slice(0, 20)

    if (import.meta.dev) {
      const context = entry.detail ? ` (${entry.detail})` : ''
      console.error(`[runtime] ${entry.source}: ${entry.message}${context}`)
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
