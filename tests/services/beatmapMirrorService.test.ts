import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import BeatmapMirrorService from '../../src/services/beatmapMirrorService'
import { DefaultBeatmapMirrors } from '../../src/config/beatmapMirrors'

describe('BeatmapMirrorService', () => {
  let mirrorService: BeatmapMirrorService

  beforeEach(() => {
    BeatmapMirrorService.resetInstanceForTest()
    mirrorService = BeatmapMirrorService.getInstance()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('fetches mirror status when cache is empty and caches result for subsequent calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200
    })
    global.fetch = fetchMock

    const statuses = await mirrorService.getMirrorsStatus()

    expect(statuses).toHaveLength(DefaultBeatmapMirrors.length)
    expect(fetchMock).toHaveBeenCalledTimes(DefaultBeatmapMirrors.length)
    for (const s of statuses) {
      expect(s.isOnline).toBe(true)
      expect(typeof s.responseTimeMs).toBe('number')
      expect(s.error).toBeUndefined()
    }

    // Subsequent call within cache TTL (5m) should use cache and not fetch again
    fetchMock.mockClear()
    const cachedStatuses = await mirrorService.getMirrorsStatus()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(cachedStatuses).toHaveLength(DefaultBeatmapMirrors.length)
  })

  it('automatically refetches after 5-minute cache TTL expires', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200
    })
    global.fetch = fetchMock

    await mirrorService.getMirrorsStatus()
    expect(fetchMock).toHaveBeenCalledTimes(DefaultBeatmapMirrors.length)

    fetchMock.mockClear()

    // Fast-forward time by 5 minutes + 1 second
    const originalDateNow = Date.now
    const futureTime = Date.now() + 5 * 60 * 1000 + 1000
    Date.now = () => futureTime

    try {
      await mirrorService.getMirrorsStatus()
      expect(fetchMock).toHaveBeenCalledTimes(DefaultBeatmapMirrors.length)
    } finally {
      Date.now = originalDateNow
    }
  })

  it('bypasses cache when forceRefresh is true', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200
    })
    global.fetch = fetchMock

    await mirrorService.getMirrorsStatus()
    expect(fetchMock).toHaveBeenCalledTimes(DefaultBeatmapMirrors.length)

    fetchMock.mockClear()
    await mirrorService.getMirrorsStatus(true)
    expect(fetchMock).toHaveBeenCalledTimes(DefaultBeatmapMirrors.length)
  })

  it('handles non-200 responses as offline with HTTP status error', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('osu.direct')) {
        return Promise.resolve({ ok: true, status: 200 })
      }
      return Promise.resolve({ ok: false, status: 503 })
    })

    const statuses = await mirrorService.getMirrorsStatus(true)

    const osuDirect = statuses.find((s) => s.name === 'osu.direct')
    expect(osuDirect?.isOnline).toBe(true)
    expect(osuDirect?.error).toBeUndefined()

    const others = statuses.filter((s) => s.name !== 'osu.direct')
    for (const o of others) {
      expect(o.isOnline).toBe(false)
      expect(o.error).toBe('HTTP 503')
    }
  })

  it('handles AbortError timeout gracefully', async () => {
    global.fetch = vi.fn().mockImplementation(() => {
      const error = new Error('The operation was aborted')
      error.name = 'AbortError'
      return Promise.reject(error)
    })

    const statuses = await mirrorService.getMirrorsStatus(true)

    for (const s of statuses) {
      expect(s.isOnline).toBe(false)
      expect(s.responseTimeMs).toBeNull()
      expect(s.error).toBe('Health check timeout')
    }
  })

  it('handles generic network errors gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network connection failed'))

    const statuses = await mirrorService.getMirrorsStatus(true)

    for (const s of statuses) {
      expect(s.isOnline).toBe(false)
      expect(s.responseTimeMs).toBeNull()
      expect(s.error).toBe('Network connection failed')
    }
  })

  it('returns only online mirror names from getHealthyMirrorNames', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('osu.direct') || url.includes('catboy.best')) {
        return Promise.resolve({ ok: true, status: 200 })
      }
      return Promise.resolve({ ok: false, status: 500 })
    })

    const healthyNames = await mirrorService.getHealthyMirrorNames(true)

    expect(healthyNames.has('osu.direct')).toBe(true)
    expect(healthyNames.has('catboy.best')).toBe(true)
    expect(healthyNames.size).toBe(2)
  })
})
