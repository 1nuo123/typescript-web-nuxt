import { describe, expect, it, vi } from 'vitest'
import {
  buildCodexPwaLegacyCacheMeasurement,
  buildCodexPwaLegacyControllerMeasurement,
  cleanupCodexPwaArtifacts,
  isCodexPwaCacheName,
  shouldReloadAfterCodexPwaCleanup,
} from '../../app/utils/codex-pwa-cleanup'

describe('Codex PWA cleanup', () => {
  it('only recognizes known PWA cache prefixes', () => {
    expect(isCodexPwaCacheName('workbox-precache-v2')).toBe(true)
    expect(isCodexPwaCacheName('vite-pwa-assets')).toBe(true)
    expect(isCodexPwaCacheName('application-data')).toBe(false)
  })

  it('unregisters only same-origin root workers and preserves unknown caches', async () => {
    const rootUnregister = vi.fn().mockResolvedValue(true)
    const nestedUnregister = vi.fn().mockResolvedValue(true)
    const foreignUnregister = vi.fn().mockResolvedValue(true)
    const deleteCache = vi.fn().mockResolvedValue(true)

    const result = await cleanupCodexPwaArtifacts(
      {
        controller: {},
        getRegistrations: async () => [
          { scope: 'https://codex.example/', unregister: rootUnregister },
          {
            scope: 'https://codex.example/nested/',
            unregister: nestedUnregister,
          },
          { scope: 'https://other.example/', unregister: foreignUnregister },
        ],
      },
      {
        keys: async () => ['workbox-precache-v2', 'application-data'],
        delete: deleteCache,
      },
      'https://codex.example/codex/tasks',
    )

    expect(rootUnregister).toHaveBeenCalledOnce()
    expect(nestedUnregister).not.toHaveBeenCalled()
    expect(foreignUnregister).not.toHaveBeenCalled()
    expect(deleteCache).toHaveBeenCalledWith('workbox-precache-v2')
    expect(deleteCache).not.toHaveBeenCalledWith('application-data')
    expect(result).toMatchObject({
      rootWorkersUnregistered: 1,
      pwaCachesDeleted: 1,
      knownPwaCacheDetected: true,
      controllerStillActive: true,
    })
  })

  it('allows at most one controlled reload after cleanup', () => {
    const activeControllerResult = {
      rootWorkersUnregistered: 1,
      pwaCachesDeleted: 1,
      knownPwaCacheDetected: true,
      controllerStillActive: true,
    }

    expect(
      shouldReloadAfterCodexPwaCleanup(activeControllerResult, false),
    ).toBe(true)
    expect(shouldReloadAfterCodexPwaCleanup(activeControllerResult, true)).toBe(
      false,
    )
    expect(
      shouldReloadAfterCodexPwaCleanup(
        { ...activeControllerResult, controllerStillActive: false },
        false,
      ),
    ).toBe(false)
  })

  it('builds only a fixed in-memory measurement when an old controller remains', () => {
    expect(
      buildCodexPwaLegacyControllerMeasurement({
        rootWorkersUnregistered: 1,
        pwaCachesDeleted: 1,
        knownPwaCacheDetected: true,
        controllerStillActive: true,
      }),
    ).toEqual({
      metric: 'pwa_legacy_controller',
      observation: 'legacy_controller_detected',
      value: 1,
    })
    expect(
      buildCodexPwaLegacyControllerMeasurement({
        rootWorkersUnregistered: 0,
        pwaCachesDeleted: 0,
        knownPwaCacheDetected: false,
        controllerStillActive: false,
      }),
    ).toBeNull()
  })

  it('builds a fixed measurement when a known cache was present', () => {
    expect(
      buildCodexPwaLegacyCacheMeasurement({
        rootWorkersUnregistered: 0,
        pwaCachesDeleted: 1,
        knownPwaCacheDetected: true,
        controllerStillActive: false,
      }),
    ).toEqual({
      metric: 'pwa_legacy_cache',
      observation: 'legacy_cache_detected',
      value: 1,
    })
    expect(
      buildCodexPwaLegacyCacheMeasurement({
        rootWorkersUnregistered: 0,
        pwaCachesDeleted: 0,
        knownPwaCacheDetected: false,
        controllerStillActive: false,
      }),
    ).toBeNull()
  })
})
