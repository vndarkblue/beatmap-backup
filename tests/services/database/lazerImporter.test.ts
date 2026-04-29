import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetBeatmapsForDatabase = vi.fn()
const mockUpsertBatch = vi.fn()

vi.mock('../../../src/services/realmService', () => ({
  realmService: {
    getBeatmapsForDatabase: () => mockGetBeatmapsForDatabase()
  }
}))

vi.mock('../../../src/services/database/databaseService', () => ({
  DatabaseService: {
    getInstance: () => ({
      upsertBatch: (...args: unknown[]) => mockUpsertBatch(...args)
    })
  }
}))

describe('importFromLazerRealm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('tracks processed/accepted/skipped summary for invalid lazer rows', async () => {
    mockGetBeatmapsForDatabase.mockResolvedValue([
      { beatmapsetId: null, modeInt: 0, status: 'ranked' },
      { beatmapsetId: 0, modeInt: 0, status: 'ranked' },
      {
        md5: 'abc',
        beatmapId: 1,
        beatmapsetId: 99,
        modeInt: 0,
        status: 'ranked',
        version: 'Hard',
        stars: 3,
        totalLength: 100,
        hitLength: 80,
        bpm: 180,
        cs: 4,
        ar: 9,
        hp: 6,
        od: 8,
        artist: 'a',
        artistUnicode: '',
        title: 't',
        titleUnicode: '',
        creator: 'c',
        source: '',
        tags: '',
        rankedDate: null,
        submittedDate: null,
        video: false,
        storyboard: false
      }
    ])

    const { getLastLazerImportSummary, importFromLazerRealm } = await import(
      '../../../src/services/database/lazerImporter'
    )
    const result = await importFromLazerRealm()
    expect(result.beatmaps).toBe(1)
    expect(getLastLazerImportSummary()).toEqual({
      processed: 3,
      accepted: 1,
      skippedInvalidBeatmapsetId: 2
    })
  })
})
