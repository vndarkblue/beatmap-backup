import { beforeEach, describe, expect, it, vi } from 'vitest'
import { collectionService } from '../../../src/services/collection/collectionService'

const mockGetOsuStablePath = vi.fn<() => string | null>()
const mockExistsSync = vi.fn<(path: string) => boolean>()
const mockParseStableCollectionDb = vi.fn()
const mockGetCollections = vi.fn()
const mockDb = {
  getCollectionMapCacheByMd5: vi.fn(),
  getBeatmapsetIdByMd5: vi.fn(),
  upsertCollectionMapCacheBatch: vi.fn(),
  getCollectionSyncStats: vi.fn(() => ({
    pending: 0,
    resolved: 0,
    notFound: 0,
    failed: 0,
    missingLocal: 0
  })),
  getMeta: vi.fn(() => '0')
}

vi.mock('fs', () => ({
  default: {
    existsSync: (p: string) => mockExistsSync(p)
  }
}))

vi.mock('../../../src/services/settingsStore', () => ({
  getOsuStablePath: () => mockGetOsuStablePath()
}))

vi.mock('../../../src/services/collection/stableCollectionParser', () => ({
  parseStableCollectionDb: (p: string) => mockParseStableCollectionDb(p)
}))

vi.mock('../../../src/services/realmService', () => ({
  realmService: {
    getCollections: () => mockGetCollections()
  }
}))

vi.mock('../../../src/services/database/databaseService', () => ({
  DatabaseService: {
    getInstance: () => mockDb
  }
}))

describe('collectionService error surfacing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetOsuStablePath.mockReturnValue('C:/osu')
    mockExistsSync.mockReturnValue(true)
    mockGetCollections.mockResolvedValue([])
  })

  it('captures stable reading error in previewCollections when collection.db parse fails', async () => {
    mockParseStableCollectionDb.mockImplementation(() => {
      throw new Error(
        'collection.db is currently locked by another process (likely osu!stable). Please close the game and try again.'
      )
    })

    const result = await collectionService.previewCollections({
      stable: true,
      lazer: false,
      mergeMode: 'merge'
    })

    expect(result.success).toBe(true)
    expect(result.collections).toEqual([])
    expect(result.errors?.stable).toContain('locked by another process')
  })

  it('captures lazer reading error in previewCollections when realm fails', async () => {
    mockParseStableCollectionDb.mockReturnValue([{ name: 'Favorites', beatmapMd5s: ['abc'] }])
    mockGetCollections.mockRejectedValue(new Error('Realm database file is locked'))

    const result = await collectionService.previewCollections({
      stable: true,
      lazer: true,
      mergeMode: 'merge'
    })

    expect(result.success).toBe(true)
    expect(result.collections.length).toBe(1)
    expect(result.errors?.lazer).toContain('Realm database file is locked')
    expect(result.errors?.stable).toBeUndefined()
  })

  it('throws error when exporting selected collections if collection reading failed', async () => {
    mockParseStableCollectionDb.mockImplementation(() => {
      throw new Error('File locked')
    })

    await expect(
      collectionService.resolveCollectionBeatmapsetIds({
        stable: true,
        lazer: false,
        mergeMode: 'merge',
        selectedKeys: ['stable::Favorites']
      })
    ).rejects.toThrow('Could not read selected collections: File locked')
  })

  it('throws when a selected lazer collection cannot be read alongside stable collections', async () => {
    mockParseStableCollectionDb.mockReturnValue([{ name: 'Favorites', beatmapMd5s: ['abc'] }])
    mockGetCollections.mockRejectedValue(new Error('Realm database file is locked'))

    await expect(
      collectionService.resolveCollectionBeatmapsetIds({
        stable: true,
        lazer: true,
        mergeMode: 'split',
        selectedKeys: ['stable::Favorites', 'lazer::Lazer Favorites']
      })
    ).rejects.toThrow('Could not read selected collections: Realm database file is locked')
  })
})
