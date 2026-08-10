import { afterEach, describe, expect, it, vi } from 'vitest'
import runtimeErrorsClientPlugin from '~/plugins/runtime-errors.client'
import runtimeErrorsServerPlugin from '~/plugins/runtime-errors.server'
import {
  RUNTIME_ERROR_STATUS_CODE,
  RUNTIME_ERROR_STATUS_MESSAGE,
  RuntimeLogSource,
} from '~/types/app'

const ERROR_EVENT_NAME = 'error'
const PROMISE_REJECTION_EVENT_NAME = 'unhandledrejection'
const VUE_ERROR_INFO = 'render'

describe('runtime error plugins', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    useError().value = undefined
    clearNuxtState('runtime-logs')
  })

  it('chains Vue errors through the client handler and records diagnostics', () => {
    const previousHandler = vi.fn()
    const nuxtApp = {
      vueApp: {
        config: {
          errorHandler: previousHandler,
        },
      },
    }

    ;(runtimeErrorsClientPlugin as unknown as (app: typeof nuxtApp) => void)(
      nuxtApp,
    )
    nuxtApp.vueApp.config.errorHandler(
      new Error('Vue failure'),
      null,
      VUE_ERROR_INFO,
    )

    expect(previousHandler).toHaveBeenCalledOnce()
    expect(useError().value).toMatchObject({
      statusCode: RUNTIME_ERROR_STATUS_CODE,
      statusMessage: RUNTIME_ERROR_STATUS_MESSAGE,
      message: 'Vue failure',
    })
    expect(useClientLogger().logs.value[0]).toMatchObject({
      source: RuntimeLogSource.Vue,
      detail: VUE_ERROR_INFO,
    })
  })

  it('upgrades window and promise failures through captured client listeners', () => {
    const listeners: Partial<
      Record<string, EventListenerOrEventListenerObject>
    > = {}
    vi.spyOn(window, 'addEventListener').mockImplementation(
      (eventName, listener) => {
        listeners[String(eventName)] = listener
      },
    )
    const nuxtApp = {
      vueApp: {
        config: {
          errorHandler: undefined as
            | undefined
            | ((error: unknown, instance: unknown, info: string) => void),
        },
      },
    }

    ;(runtimeErrorsClientPlugin as unknown as (app: typeof nuxtApp) => void)(
      nuxtApp,
    )

    const errorListener = listeners[ERROR_EVENT_NAME] as EventListener
    errorListener({
      error: new Error('Window failure'),
      filename: 'app.js',
    } as ErrorEvent)
    expect(useError().value).toMatchObject({
      statusCode: RUNTIME_ERROR_STATUS_CODE,
      message: 'Window failure',
    })

    useError().value = undefined
    const rejectionListener = listeners[
      PROMISE_REJECTION_EVENT_NAME
    ] as EventListener
    rejectionListener({
      reason: new Error('Promise failure'),
    } as PromiseRejectionEvent)
    expect(useError().value).toMatchObject({
      statusCode: RUNTIME_ERROR_STATUS_CODE,
      message: 'Promise failure',
    })
  })

  it('does not turn browser ResizeObserver delivery warnings into fatal pages', () => {
    const listeners: Partial<
      Record<string, EventListenerOrEventListenerObject>
    > = {}
    vi.spyOn(window, 'addEventListener').mockImplementation(
      (eventName, listener) => {
        listeners[String(eventName)] = listener
      },
    )
    const nuxtApp = {
      vueApp: {
        config: {
          errorHandler: undefined as
            | undefined
            | ((error: unknown, instance: unknown, info: string) => void),
        },
      },
    }
    ;(runtimeErrorsClientPlugin as unknown as (app: typeof nuxtApp) => void)(
      nuxtApp,
    )

    const preventDefault = vi.fn()
    const errorListener = listeners[ERROR_EVENT_NAME] as EventListener
    errorListener({
      message: 'ResizeObserver loop completed with undelivered notifications.',
      preventDefault,
    } as unknown as ErrorEvent)

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(useError().value).toBeUndefined()
    expect(useClientLogger().logs.value).toHaveLength(0)
  })

  it('keeps server HTTP errors stable and upgrades unknown server errors', () => {
    const previousHandler = vi.fn()
    const handledApp = {
      vueApp: {
        config: {
          errorHandler: previousHandler,
        },
      },
    }

    ;(runtimeErrorsServerPlugin as unknown as (app: typeof handledApp) => void)(
      handledApp,
    )
    expect(() =>
      handledApp.vueApp.config.errorHandler(
        { statusCode: 404 },
        null,
        VUE_ERROR_INFO,
      ),
    ).not.toThrow()
    expect(previousHandler).toHaveBeenCalledOnce()
    expect(() =>
      handledApp.vueApp.config.errorHandler(
        new Error('Handled server failure'),
        null,
        VUE_ERROR_INFO,
      ),
    ).toThrow('Handled server failure')
    expect(previousHandler).toHaveBeenCalledTimes(2)

    const unhandledApp = {
      vueApp: {
        config: {
          errorHandler: undefined as
            | undefined
            | ((error: unknown, instance: unknown, info: string) => void),
        },
      },
    }
    ;(
      runtimeErrorsServerPlugin as unknown as (app: typeof unhandledApp) => void
    )(unhandledApp)
    expect(unhandledApp.vueApp.config.errorHandler).toBeTypeOf('function')
    expect(() =>
      unhandledApp.vueApp.config.errorHandler?.(
        new Error('Server failure'),
        null,
        VUE_ERROR_INFO,
      ),
    ).toThrow('Server failure')
  })
})
