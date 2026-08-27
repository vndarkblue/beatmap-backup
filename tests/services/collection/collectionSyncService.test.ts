import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CollectionSyncService from '../../../src/services/collection/collectionSyncService'
import { OsuDirectRateLimitError } from '../../../src/services/collection/osuDirectService'

const mockDb = {
  getCollectionSyncStats: vi.fn(() => ({
    pending: 0,
    resolved: 0,
    notFound: 0,
    failed: 0,
    missingLocal: 0
  })),
  getMeta: vi.fn(() => '0'),
  setMeta: vi.fn(),
  getCollectionMapCachePendingForSync: vi.fn(),
  upsertCollectionMapCache: vi.fn(),
  getPendingCollectionMapCacheCount: vi.fn(() => 0)
}

const mockResolveMd5 = vi.fn()

vi.mock('../../../src/services/database/databaseService', () => ({
  DatabaseService: {
    getInstance: () => mockDb
  }
}))

vi.mock('../../../src/services/collection/osuDirectService', () => ({
  OsuDirectRateLimitError: class OsuDirectRateLimitError extends Error {
    readonly status = 429
    readonly retryAfterMs: number
    constructor(message: string, retryAfterMs = 60_000) {
      super(message)
      this.name = 'OsuDirectRateLimitError'
      this.retryAfterMs = retryAfterMs
    }
  },
  resolveMd5FromOsuDirect: (...args: unknown[]) => mockResolveMd5(...args)
}))

describe('CollectionSyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('tracks and exposes a consistent sync run summary', async () => {
    mockDb.getCollectionMapCachePendingForSync.mockReturnValue([
      { md5hash: 'a', beatmapid: 1, beatmapsetid: 10, missing: 0, sourceHint: 'stable' },
      { md5hash: 'b', beatmapid: 2, beatmapsetid: 20, missing: 0, sourceHint: 'stable' },
      { md5hash: 'c', beatmapid: 3, beatmapsetid: 30, missing: 0, sourceHint: 'stable' }
    ])

    mockResolveMd5
      .mockResolvedValueOnce({ beatmapId: 1, beatmapsetId: 101 })
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('network'))

    const service = CollectionSyncService.getInstance()
    await service.syncMissingMd5s()

    expect(service.getLastRunSummary()).toEqual({
      processed: 3,
      resolved: 1,
      notFound: 1,
      failed: 1
    })
  })

  it('aborts batch and sets rate limit cooldown when 429 is encountered', async () => {
    mockDb.getCollectionMapCachePendingForSync.mockReturnValue([
      { md5hash: 'a', beatmapid: 1, beatmapsetid: 10, missing: 0, sourceHint: 'stable' },
      { md5hash: 'b', beatmapid: 2, beatmapsetid: 20, missing: 0, sourceHint: 'stable' },
      { md5hash: 'c', beatmapid: 3, beatmapsetid: 30, missing: 0, sourceHint: 'stable' }
    ])

    mockResolveMd5
      .mockResolvedValueOnce({ beatmapId: 1, beatmapsetId: 101 })
      .mockRejectedValueOnce(new OsuDirectRateLimitError('Rate limited', 30_000))

    const service = CollectionSyncService.getInstance()
    await service.syncMissingMd5s()

    // Processed 2 items, broke loop before 3rd item
    expect(service.getLastRunSummary()).toEqual({
      processed: 2,
      resolved: 1,
      notFound: 0,
      failed: 0
    })

    expect(service.getRateLimitCooldownUntil()).toBeGreaterThan(Date.now() + 25_000)

    // Manual sync request should be blocked by cooldown
    const manualResult = await service.requestManualSync()
    expect(manualResult.executed).toBe(false)
    expect(manualResult.reason).toBe('cooldown')
    expect(manualResult.retryAfterMs).toBeGreaterThan(0)
  })
})
